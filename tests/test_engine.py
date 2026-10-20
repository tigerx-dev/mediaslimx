import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from PIL import Image

from mediaslimx import media
from mediaslimx.engine import Engine
from mediaslimx.paths import commit_file, fingerprint

def directory_link(link, target):
    if os.name == "nt":
        subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(target)], check=True, capture_output=True)
    else:
        link.symlink_to(target, target_is_directory=True)


PARAMS = {"preset": "balanced", "max_width": None, "max_height": None}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / "media"
        self.root.mkdir()
        self.engine = Engine(self.base / "data", [self.root])

    def tearDown(self):
        self.tmp.cleanup()

    def jpg(self, name="nested/a.jpg"):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (640, 480), (230, 80, 20)).save(p, quality=100)
        return p

    def task(self, mode="export", params=None, scan=None, **kwargs):
        scan = scan or self.engine.scan(str(self.root))
        ids = [e["id"] for e in scan["entries"] if e["status"] == "ready"]
        task_id = self.engine.create(scan["id"], ids, params or PARAMS, mode,
                                     output=str(self.base / "out"), backup=str(self.base / "backups"), **kwargs)
        return self.engine.wait(task_id)

    def test_export_same_structure_real_compression_csv_and_preview(self):
        p = self.jpg()
        original = p.read_bytes()
        t = self.task()
        e = t["entries"][0]
        self.assertRegex(t["folder_name"], r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[0-9a-f]{8}$")
        self.assertEqual(Path(e["destination"]).relative_to(Path(t["output_root"]) / t["folder_name"]).as_posix(), e["relative"])
        self.assertEqual(e["status"], "success")
        self.assertLess(e["result_size"], e["size"])
        self.assertEqual(p.read_bytes(), original)
        self.assertTrue(Path(e["destination"]).as_posix().endswith("/nested/a.jpg"))
        self.assertEqual(Path(e["destination"]).stat().st_mode & 0o777, p.stat().st_mode & 0o777)
        self.assertIn("nested/a.jpg", self.engine.report(t["id"]))
        self.assertNotIn(str(self.root), self.engine.report(t["id"]))
        self.assertEqual(self.engine.preview(t["id"], e["id"], "original")[0], p)

    def test_boundary_hidden_dependencies_nonmedia_and_symlink(self):
        self.jpg("good.jpg")
        self.jpg(".hidden/private.jpg")
        self.jpg("node_modules/dependency.jpg")
        (self.root / "source.py").write_text("not media")
        external = self.base / "outside";external.mkdir()
        Image.new("RGB", (20,20)).save(external / "outside.jpg")
        directory_link(self.root / "alias", external)
        if os.name != "nt":
            (self.root / "alias.jpg").symlink_to(external / "outside.jpg")
        scan = self.engine.scan(str(self.root))
        self.assertEqual([e["relative"] for e in scan["entries"] if e["status"]=="ready"], ["good.jpg"])
        self.assertEqual(scan["non_media"], 1)
        if os.name != "nt":
            self.assertTrue(next(e for e in scan["entries"] if e["relative"]=="alias.jpg")["reason"])
        self.assertGreaterEqual(scan["skipped_dirs"], 3)
        for p in [external, self.root / "..", self.root / "alias"]:
            with self.assertRaises(ValueError):
                self.engine.scan(str(p))

    def test_no_gain_copies_original_in_export_and_leaves_backup_mode_alone(self):
        p = self.root / "pixel.png"
        Image.new("RGBA",(1,1),(1,2,3,80)).save(p,optimize=True)
        before = p.read_bytes()
        t = self.task()
        e = t["entries"][0]
        self.assertEqual(e["status"], "no_gain")
        self.assertEqual(Path(e["destination"]).read_bytes(), before)
        t2=self.task(mode="backup")
        self.assertEqual(t2["entries"][0]["status"],"no_gain")
        self.assertIsNone(t2["entries"][0]["backup"])
        self.assertEqual(p.read_bytes(),before)

    def test_unregistered_default_artifact_directories_are_never_rescanned(self):
        self.jpg("kept/good.jpg")
        names = ["mediaslimx-export", "mediaslimx-backup", "mediaslimx-exports", "MediaSlimX-BACKUPS"]
        for name in names:
            self.jpg(name + "/old-task/nested.jpg")
        scan = self.engine.scan(str(self.root))
        self.assertEqual([entry["relative"] for entry in scan["entries"]], ["kept/good.jpg"])
        self.assertEqual(scan["skipped_dirs"], len(names))
        for name in names:
            for root in (self.root / name, self.root / name / "old-task"):
                with self.assertRaisesRegex(ValueError, "不允许扫描"):
                    self.engine.scan(str(root))

    def test_backup_restore_and_history_survive_restart(self):
        p = self.jpg()
        original = p.read_bytes()
        t = self.task("backup")
        e = t["entries"][0]
        self.assertEqual(e["status"], "success")
        self.assertEqual(Path(e["backup"]).read_bytes(), original)
        self.assertNotEqual(p.read_bytes(), original)
        again = Engine(self.base / "data", [self.root])
        restored = again.restore(t["id"], e["id"])
        self.assertEqual(restored["entries"][0]["status"], "restored")
        self.assertEqual(p.read_bytes(), original)
        self.assertEqual(Path(e["backup"]).read_bytes(), original)

    def test_restore_conflict_does_not_replace_newer_content(self):
        p = self.jpg()
        t = self.task("backup")
        p.write_bytes(b"newer version")
        restored = self.engine.restore(t["id"])
        self.assertEqual(restored["entries"][0]["status"], "restore_conflict")
        self.assertEqual(p.read_bytes(), b"newer version")

    def test_backup_tamper_conflict(self):
        p = self.jpg()
        t = self.task("backup")
        compressed = p.read_bytes()
        Path(t["entries"][0]["backup"]).write_bytes(b"tampered")
        restored = self.engine.restore(t["id"])
        self.assertEqual(restored["entries"][0]["status"], "restore_conflict")
        self.assertEqual(p.read_bytes(), compressed)

    def test_overwrite_requires_consent_and_has_no_fake_original_preview(self):
        self.jpg()
        scan = self.engine.scan(str(self.root))
        with self.assertRaisesRegex(ValueError, "明确确认"):
            self.task("overwrite", scan=scan)
        t = self.task("overwrite", scan=scan, confirm=True)
        e = t["entries"][0]
        self.assertEqual(e["status"],"success")
        with self.assertRaisesRegex(ValueError, "原文件未保留"):
            self.engine.preview(t["id"],e["id"],"original")
        with self.assertRaises(ValueError):
            self.engine.restore(t["id"])

    def test_source_changed_after_scan_and_during_encode(self):
        p = self.jpg()
        scan = self.engine.scan(str(self.root))
        p.write_bytes(b"changed")
        t = self.task("backup",scan=scan)
        self.assertEqual(t["entries"][0]["status"],"failed")
        self.assertEqual(p.read_bytes(),b"changed")
        self.jpg()
        optimize = media.optimize
        def changing(*args):
            result=optimize(*args)
            p.write_bytes(b"concurrent new version")
            return result
        with patch("mediaslimx.media.optimize",side_effect=changing):
            t=self.task("backup")
        self.assertEqual(t["entries"][0]["status"],"failed")
        self.assertEqual(p.read_bytes(),b"concurrent new version")

    def test_duplicate_prevention_persists_and_changed_params_allowed(self):
        self.jpg()
        self.task("backup")
        engine = Engine(self.base / "data", [self.root])
        self.engine=engine
        t=self.task()
        e=t["entries"][0]
        self.assertEqual(e["status"],"duplicate")
        self.assertEqual(Path(e["source"]).read_bytes(),Path(e["destination"]).read_bytes())
        t=self.task(params={"preset":"small","max_width":None,"max_height":None})
        self.assertNotEqual(t["entries"][0]["status"],"duplicate")

    def test_output_backup_and_runtime_excluded(self):
        self.jpg("a.jpg")
        out = self.root / "custom-results"
        scan=self.engine.scan(str(self.root))
        key=self.engine.create(scan["id"],[scan["entries"][0]["id"]],PARAMS,"export",output=str(out))
        t=self.engine.wait(key)
        self.assertEqual(t["entries"][0]["status"],"success")
        scan=self.engine.scan(str(self.root))
        self.assertEqual(len(scan["entries"]),1)
        with self.assertRaises(ValueError):
            self.engine.scan(str(out))
        with self.assertRaises(ValueError):
            self.engine.create(scan["id"],[scan["entries"][0]["id"]],PARAMS,"export",output=str(self.root))

    def test_cancel_keeps_completed_and_cleans_temps(self):
        for i in range(3):self.jpg(str(i)+".jpg")
        original=media.optimize
        entered,release=threading.Event(),threading.Event()
        count=0
        def barrier(*args):
            nonlocal count
            count+=1
            if count==2:
                entered.set()
                self.assertTrue(release.wait(10))
            return original(*args)
        scan=self.engine.scan(str(self.root))
        with patch("mediaslimx.media.optimize",side_effect=barrier):
            key=self.engine.create(scan["id"],[e["id"] for e in scan["entries"]],PARAMS,"export",output=str(self.base/"out"))
            self.assertTrue(entered.wait(10))
            self.engine.cancel(key);release.set();t=self.engine.wait(key)
        self.assertEqual([e["status"] for e in t["entries"]],["success","cancelled","cancelled"])
        self.assertTrue(Path(t["entries"][0]["destination"]).is_file())
        self.assertEqual(list(self.engine.work_dir.iterdir()),[])
        self.assertFalse(list((self.base/"out").rglob("*.tmp")))

    def test_safe_exit_resume_keeps_completed_export_and_rechecks_sources(self):
        paths = [self.jpg(f"{i}.jpg") for i in range(3)]
        original_hashes = [fingerprint(p) for p in paths]
        real_optimize = media.optimize
        entered, release = threading.Event(), threading.Event()
        calls = 0
        def pause_second(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                entered.set()
                self.assertTrue(release.wait(10))
            return real_optimize(*args)
        scan = self.engine.scan(str(self.root))
        with patch("mediaslimx.media.optimize", side_effect=pause_second):
            key = self.engine.create(scan["id"], [e["id"] for e in scan["entries"]], PARAMS,
                                     "export", output=str(self.base / "out"))
            self.assertTrue(entered.wait(10))
            self.engine.begin_shutdown()
            release.set()
            stopped = self.engine.wait(key)
        self.assertEqual(stopped["stop_reason"], "exit")
        self.assertEqual([e["status"] for e in stopped["entries"]], ["success", "cancelled", "cancelled"])
        completed = stopped["entries"][0]
        result_fp = fingerprint(completed["destination"])
        restarted = Engine(self.base / "data", [self.root])
        self.assertEqual(restarted.get("task", key)["status"], "cancelled")
        self.assertEqual(restarted.resume(key), key)
        resumed = restarted.wait(key)
        self.assertEqual(resumed["status"], "completed")
        self.assertEqual([e["status"] for e in resumed["entries"]], ["success"] * 3)
        self.assertEqual(fingerprint(completed["destination"]), result_fp)
        self.assertEqual([fingerprint(p) for p in paths], original_hashes)
        self.assertEqual(resumed["resume_count"], 1)
        with self.assertRaisesRegex(ValueError, "已停止或已中断"):
            restarted.resume(key)

    def test_interrupted_resume_marks_changed_source_failed_without_overwrite(self):
        paths = [self.jpg(f"{i}.jpg") for i in range(2)]
        scan = self.engine.scan(str(self.root))
        task = self.task(scan=scan)
        second = task["entries"][1]
        Path(second["destination"]).unlink()
        second.update(status="processing", destination=None, result_fp=None,
                      result_size=second["size"])
        task["status"] = "running"
        self.engine.save("task", task)
        changed = paths[1]
        Image.new("RGB", (640, 480), "purple").save(changed, quality=100)
        changed_fp = fingerprint(changed)
        restarted = Engine(self.base / "data", [self.root])
        recovered = restarted.get("task", task["id"])
        self.assertEqual(recovered["status"], "interrupted")
        self.assertEqual(recovered["entries"][1]["status"], "cancelled")
        restarted.resume(task["id"])
        result = restarted.wait(task["id"])
        self.assertEqual(result["entries"][0]["status"], "success")
        self.assertEqual(result["entries"][1]["status"], "failed")
        self.assertEqual(fingerprint(changed), changed_fp)

    def test_resume_reuses_verified_task_backup_and_rejects_tampering(self):
        self.jpg("a.jpg")
        self.jpg("b.jpg")
        task = self.task(mode="backup")
        second = task["entries"][1]
        backup = Path(second["backup"])
        backup_fp = fingerprint(backup)
        original = backup.read_bytes()
        # Model a stop after the backup was committed, before source replacement.
        Path(second["source"]).write_bytes(original)
        os.utime(second["source"], ns=(second["source_fp"]["mtime_ns"], second["source_fp"]["mtime_ns"]))
        second.update(status="cancelled", destination=None, result_fp=None,
                      result_size=second["size"])
        task["status"] = "cancelled"
        self.engine.save("task", task)
        self.engine.resume(task["id"])
        resumed = self.engine.wait(task["id"])
        self.assertEqual(resumed["entries"][1]["status"], "success")
        self.assertEqual(fingerprint(backup), backup_fp)
        # Recreate a pending attempt with a damaged backup: fail closed.
        second = resumed["entries"][1]
        Path(second["source"]).write_bytes(original)
        os.utime(second["source"], ns=(second["source_fp"]["mtime_ns"], second["source_fp"]["mtime_ns"]))
        backup.write_bytes(b"tampered")
        second.update(status="cancelled", destination=None, result_fp=None,
                      result_size=second["size"])
        resumed["status"] = "cancelled"
        self.engine.save("task", resumed)
        self.engine.resume(resumed["id"])
        failed = self.engine.wait(resumed["id"])
        self.assertEqual(failed["entries"][1]["status"], "failed")
        self.assertEqual(backup.read_bytes(), b"tampered")

    def test_resume_never_overwrites_a_new_export_destination(self):
        self.jpg("a.jpg")
        self.jpg("b.jpg")
        task = self.task()
        entry = task["entries"][1]
        destination = Path(entry["destination"])
        destination.write_bytes(b"newer file")
        entry.update(status="cancelled", destination=None, result_fp=None,
                     result_size=entry["size"])
        task["status"] = "cancelled"
        self.engine.save("task", task)
        self.engine.resume(task["id"])
        result = self.engine.wait(task["id"])
        self.assertEqual(result["entries"][1]["status"], "failed")
        self.assertEqual(destination.read_bytes(), b"newer file")

    def test_resume_overwrite_rejects_changed_source(self):
        path = self.jpg()
        scan = self.engine.scan(str(self.root))
        task = self.task(mode="overwrite", scan=scan, confirm=True)
        entry = task["entries"][0]
        Image.new("RGB", (640, 480), "purple").save(path, quality=100)
        changed = fingerprint(path)
        entry.update(status="cancelled", destination=None, result_fp=None,
                     result_size=entry["size"])
        task["status"] = "cancelled"
        self.engine.save("task", task)
        self.engine.resume(task["id"])
        result = self.engine.wait(task["id"])
        self.assertEqual(result["entries"][0]["status"], "failed")
        self.assertEqual(fingerprint(path), changed)

    def test_damaged_and_animated_and_extension_mismatch(self):
        (self.root/"damaged.jpg").write_bytes(b"not a jpeg")
        Image.new("RGB",(20,20)).save(self.root/"wrong.jpg",format="PNG")
        a=Image.new("RGB",(20,20),"red");b=Image.new("RGB",(20,20),"blue")
        a.save(self.root/"animated.webp",save_all=True,append_images=[b],duration=100,loop=0)
        scan=self.engine.scan(str(self.root))
        byname={e["relative"]:e for e in scan["entries"]}
        self.assertEqual(byname["damaged.jpg"]["status"],"failed")
        self.assertEqual(byname["animated.webp"]["status"],"unsupported")
        self.assertEqual(byname["wrong.jpg"]["status"],"unsupported")

    def test_png_alpha_and_webp_resize_format(self):
        Image.new("RGBA",(128,96),(255,30,10,90)).save(self.root/"alpha.png",compress_level=0)
        Image.new("RGB",(128,96),"green").save(self.root/"static.webp",lossless=True)
        t=self.task(params={"preset":"balanced","max_width":64,"max_height":None})
        for e in t["entries"]:
            self.assertIn(e["status"],{"success","no_gain"})
            with Image.open(e["destination"]) as image:
                self.assertEqual(image.format,e["info"]["format"])
                if e["status"]=="success":self.assertEqual(image.size,(64,48))
        alpha=next(e for e in t["entries"] if e["relative"]=="alpha.png")
        with Image.open(alpha["destination"]) as image:self.assertIn("A",image.mode)

    def test_existing_target_and_parent_symlink_not_overwritten(self):
        p=self.jpg()
        target=self.base/"publish"/"a.jpg"
        target.parent.mkdir();target.write_bytes(b"existing")
        with self.assertRaises(FileExistsError):
            commit_file(p,target,exclusive=True)
        self.assertEqual(target.read_bytes(),b"existing")
        outside=self.base/"outside";outside.mkdir()
        def swap():
            target.parent.rename(self.base/"moved")
            directory_link(target.parent, outside)
        with self.assertRaises((ValueError, OSError)):
            commit_file(p,target,before=swap)
        self.assertFalse((outside/"a.jpg").exists())
        self.assertFalse(list((self.base/"moved").glob("*.tmp")))
        self.assertFalse(list(target.parent.glob("*.tmp")))

    def test_backup_tasks_use_distinct_directories_and_keep_original(self):
        p=self.jpg()
        first=self.task("backup")
        backup=Path(first["entries"][0]["backup"])
        original=backup.read_bytes()
        Image.new("RGB",(640,480),"purple").save(p,quality=100)
        second=self.task("backup")
        secondbackup=Path(second["entries"][0]["backup"])
        self.assertNotEqual(backup.parent,secondbackup.parent)
        self.assertEqual(backup.read_bytes(),original)

    def test_csv_formula_injection_escaped(self):
        self.jpg("=SUM(1).jpg")
        t=self.task()
        self.assertIn("'=SUM(1).jpg",self.engine.report(t["id"]))

    def test_interrupted_commit_recovery_reconciles_fingerprint(self):
        self.jpg()
        t=self.task("backup")
        e=t["entries"][0]
        e["planned_fp"]=e["result_fp"];e["status"]="committing"
        t["status"]="running";self.engine.save("task",t)
        restarted=Engine(self.base/"data",[self.root])
        recovered=restarted.get("task",t["id"])
        self.assertEqual(recovered["status"],"interrupted")
        self.assertEqual(recovered["entries"][0]["status"],"success")
        restarted.restore(t["id"])
        self.assertEqual(fingerprint(e["source"])["sha256"],e["source_fp"]["sha256"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),"FFmpeg unavailable")
    def test_mp4_real_transcode_audio_and_complex_stream_rejection(self):
        p=self.root/"sample.mp4"
        subprocess.run(["ffmpeg","-nostdin","-v","error","-f","lavfi","-i","testsrc2=size=160x120:rate=24","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","1","-c:v","libx264","-crf","0","-pix_fmt","yuv420p","-threads","1","-c:a","aac",str(p)],check=True)
        t=self.task();e=t["entries"][0]
        self.assertEqual(e["status"],"success",e["reason"])
        self.assertEqual(e["result_info"]["audio"],"aac")
        def audio(path):
            return subprocess.check_output(["ffmpeg","-nostdin","-v","error","-i",str(path),"-map","0:a:0","-c","copy","-f","adts","-"])
        self.assertEqual(hashlib.sha256(audio(p)).digest(),hashlib.sha256(audio(e["destination"])).digest())
        original=media.probe(p)
        with patch("mediaslimx.media.probe",return_value={**original,"streams":original["streams"]+[{"codec_type":"subtitle"}]}):
            with self.assertRaisesRegex(ValueError,"复杂流"):media.inspect(p,".mp4")
        with patch("mediaslimx.media.shutil.which",return_value=None):
            with self.assertRaisesRegex(ValueError,"安装"):media.inspect(p,".mp4")

    def test_backup_precommit_record_never_claims_success(self):
        self.jpg()
        saved=[]
        original_save=self.engine.save
        def recording(kind,record):
            if kind=="task":
                import copy
                saved.append(copy.deepcopy(record))
            return original_save(kind,record)
        with patch.object(self.engine,"save",side_effect=recording):
            self.task("backup")
        for t in saved:
            for e in t["entries"]:
                if e.get("backup") and not e.get("result_fp"):
                    self.assertNotEqual(e["status"],"success")

    def test_failed_publication_keeps_original_and_valid_backup(self):
        p=self.jpg()
        original=p.read_bytes()
        real_commit=commit_file
        def fail_target(source,destination,**kwargs):
            if Path(destination)==p:
                raise OSError("synthetic disk write failure before publication")
            return real_commit(source,destination,**kwargs)
        with patch("mediaslimx.engine.commit_file",side_effect=fail_target):
            t=self.task("backup")
        e=t["entries"][0]
        self.assertEqual(e["status"],"failed")
        self.assertEqual(p.read_bytes(),original)
        self.assertEqual(Path(e["backup"]).read_bytes(),original)
        self.assertFalse(list(self.base.rglob("*.tmp")))

    def test_invalid_result_cannot_replace_source(self):
        p=self.jpg()
        original=p.read_bytes()
        with patch("mediaslimx.media.validate_result",side_effect=ValueError("synthetic output validation failure")):
            t=self.task("backup")
        self.assertEqual(t["entries"][0]["status"],"failed")
        self.assertEqual(p.read_bytes(),original)
        self.assertIsNone(t["entries"][0]["backup"])

    def test_report_error_paths_redacted_and_missing_destination_friendly(self):
        p=self.jpg()
        scan=self.engine.scan(str(self.root))
        with self.assertRaisesRegex(ValueError,"请填写"):
            self.engine.create(scan["id"],[scan["entries"][0]["id"]],PARAMS,"export")
        p.unlink()
        t=self.task(scan=scan)
        report=self.engine.report(t["id"])
        self.assertNotIn(str(self.root),report)
        self.assertEqual(t["entries"][0]["status"],"failed")

    def test_running_task_rejects_second_writer(self):
        self.jpg()
        self.engine.worker_lock.acquire()
        try:
            scan=self.engine.scan(str(self.root))
            with self.assertRaisesRegex(ValueError,"已有"):
                self.engine.create(scan["id"],[scan["entries"][0]["id"]],PARAMS,"export",output=str(self.base/"out"))
        finally:
            self.engine.worker_lock.release()

    def test_hidden_files_including_windows_attributes_are_skipped(self):
        self.jpg("visible.jpg")
        self.jpg(".private.jpg")
        if os.name=="nt":
            import ctypes
            hidden=self.jpg("hidden-attribute.jpg")
            directory=self.root/"hidden-directory";directory.mkdir()
            self.jpg("hidden-directory/inside.jpg")
            kernel=ctypes.WinDLL("kernel32",use_last_error=True)
            kernel.SetFileAttributesW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint32]
            self.assertTrue(kernel.SetFileAttributesW(str(hidden),0x2))
            self.assertTrue(kernel.SetFileAttributesW(str(directory),0x2))
        scan=self.engine.scan(str(self.root))
        self.assertEqual([e["relative"] for e in scan["entries"]],["visible.jpg"])
        self.assertGreaterEqual(scan["skipped_files"],1)


if __name__=="__main__":
    unittest.main()
