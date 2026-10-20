"""Actual HTTP integration against a separate loopback Uvicorn process."""
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from PIL import Image


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.base=Path(cls.tmp.name)
        cls.root=cls.base/"media";cls.root.mkdir()
        Image.new("RGB",(640,480),"red").save(cls.root/"photo.jpg",quality=100)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));cls.port=sock.getsockname()[1]
        cls.url=f"http://127.0.0.1:{cls.port}"
        cls.token="test-token-not-a-production-secret"
        code = "from mediaslimx.engine import Engine; from mediaslimx.app import create_app; import uvicorn; import sys; e=Engine(sys.argv[1],[sys.argv[2]]); uvicorn.run(create_app(e,sys.argv[3],int(sys.argv[4])),host='127.0.0.1',port=int(sys.argv[4]),log_level='error',access_log=False)"
        cls.proc=subprocess.Popen([sys.executable,"-c",code,str(cls.base/"data"),str(cls.root),cls.token,str(cls.port)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        cls.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        for i in range(100):
            try:cls.request("/api/environment");break
            except (urllib.error.URLError,ConnectionError):time.sleep(.05)
        else:raise RuntimeError("HTTP service did not start")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=10)
        cls.proc.stderr.close()
        cls.tmp.cleanup()

    @classmethod
    def request(cls,path,body=None,headers=None,auth=True,method=None):
        h={"X-MediaSlimX-Token":cls.token} if auth else {}
        if body is not None:h["Content-Type"]="application/json"
        h.update(headers or {})
        request=urllib.request.Request(cls.url+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
        with cls.opener.open(request,timeout=20) as response:
            return response.status,{k.lower():v for k,v in response.headers.items()},response.read()

    def test_storage_brand_assets_use_an_explicit_allowlist(self):
        for name in ("storage.js", "brand/favicon.svg", "brand/mark.svg"):
            status, headers, body = self.request("/static/" + name, auth=False)
            self.assertEqual(status, 200)
            self.assertTrue(body)
            self.assertEqual(headers.get("x-content-type-options"), "nosniff")
        for name in ("brand/missing.svg", "brand/../app.py", "brand/nested/mark.svg", "imports.py"):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request("/static/" + name, auth=False)
            self.assertEqual(error.exception.code, 404)

    def test_auth_host_origin_fetch_metadata_and_no_get_writes(self):
        for headers,auth,status in [({},False,401),({"Origin":"https://evil.example"},True,403),({"Host":"evil.example"},True,403),({"Sec-Fetch-Site":"cross-site"},True,403)]:
            with self.subTest(headers=headers):
                with self.assertRaises(urllib.error.HTTPError) as ex:self.request("/api/environment",headers=headers,auth=auth)
                self.assertEqual(ex.exception.code,status)
        with self.assertRaises(urllib.error.HTTPError) as ex:self.request("/api/tasks/missing/cancel")
        self.assertEqual(ex.exception.code,405)

    def test_complete_scan_task_result_report_preview_and_ranges(self):
        self.request("/api/session",{})
        _,_,body=self.request("/api/scans",{"path":str(self.root)})
        scan=json.loads(body);self.assertEqual(len(scan["entries"]),1)
        _,_,body=self.request("/api/tasks",{"scan_id":scan["id"],"selected":[scan["entries"][0]["id"]],"output":str(self.base/"out")})
        key=json.loads(body)["id"]
        for i in range(100):
            _,_,body=self.request("/api/tasks/"+key);task=json.loads(body)
            if task["status"]=="completed":break
            time.sleep(.05)
        self.assertEqual(task["status"],"completed")
        e=task["entries"][0];self.assertEqual(e["status"],"success",e["reason"])
        status,h,body=self.request(f"/api/tasks/{key}/preview/{e['id']}/result",headers={"Range":"bytes=0-15"},auth=False)
        self.assertEqual(status,206);self.assertEqual(len(body),16);self.assertIn("content-range",h)
        self.assertEqual(body[:2],b"\xff\xd8")
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request(f"/api/tasks/{key}/preview/{e['id']}/result",headers={"Range":"bytes=999999999-"},auth=False)
        self.assertEqual(ex.exception.code,416)
        _,_,csv=self.request(f"/api/tasks/{key}/report.csv")
        self.assertIn(b"photo.jpg",csv);self.assertNotIn(str(self.root).encode(),csv)
        _,_,history=self.request("/api/tasks");self.assertIn(key.encode(),history)
        for headers,auth,expected in [({},True,400),({},False,401),({"Origin":"https://evil.example"},True,403)]:
            with self.subTest(open_folder_headers=headers,auth=auth):
                with self.assertRaises(urllib.error.HTTPError) as ex:
                    self.request(f"/api/tasks/{key}/open-result-folder",{},headers=headers,auth=auth)
                self.assertEqual(ex.exception.code,expected)
                with self.assertRaises(urllib.error.HTTPError) as ex:
                    self.request(f"/api/tasks/{key}/open-folder/source",{},headers=headers,auth=auth)
                self.assertEqual(ex.exception.code,expected)
        with self.assertRaises(urllib.error.HTTPError):
            self.request(f"/api/tasks/{key}/preview/{e['id']}/../../source.py",auth=False)

    def test_static_ui_empty_state_and_local_assets(self):
        status,headers,body=self.request("/",auth=False)
        self.assertEqual(status,200)
        self.assertIn("选择目录，或拖入文件与文件夹".encode(),body)
        self.assertIn("content-security-policy",headers)
        self.assertEqual(headers["x-frame-options"],"DENY")
        for path in ["/static/app.js","/static/style.css"]:
            self.assertEqual(self.request(path,auth=False)[0],200)
        with self.assertRaises(urllib.error.HTTPError):self.request("/static/tasks.sqlite3",auth=False)

    def test_scan_escape_and_unknown_fields_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/scans",{"path":str(self.base)})
        self.assertEqual(ex.exception.code,400)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/scans",{"path":str(self.root),"unexpected":True})
        self.assertEqual(ex.exception.code,422)

    def test_directory_browser_is_authenticated_and_bounded(self):
        _,_,body=self.request("/api/directories/browse",{"path":str(self.root),"purpose":"media"})
        data=json.loads(body)
        self.assertEqual(data["path"],str(self.root))
        self.assertIsNone(data["parent"])
        self.assertEqual(data["directories"],[])
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/browse",{"path":str(self.base)},auth=False)
        self.assertEqual(ex.exception.code,401)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/browse",{"path":str(self.base)})
        self.assertEqual(ex.exception.code,400)

    def test_native_picker_disabled_in_server_and_cannot_accept_arbitrary_root(self):
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/native/cancel",{"request_id":"r1"})
        self.assertEqual(ex.exception.code,400)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/native/cancel",{"request_id":"r1"},auth=False)
        self.assertEqual(ex.exception.code,401)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/native/cancel",{"request_id":"../invalid"})
        self.assertEqual(ex.exception.code,422)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/native",{"purpose":"media"})
        self.assertEqual(ex.exception.code,400)
        with self.assertRaises(urllib.error.HTTPError) as ex:
            self.request("/api/directories/native",{"purpose":"media","path":str(self.base)})
        self.assertEqual(ex.exception.code,422)


if __name__=="__main__":
    unittest.main()
