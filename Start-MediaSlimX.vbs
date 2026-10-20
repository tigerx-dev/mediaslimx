Option Explicit

' GUI-subsystem source launcher: hide only the preparation console. The Python
' owner and WebView2 window still use their normal verified startup/exit path.
Dim shell, files, project, startScript, powerShell, command, dataDir, port, i, digit, value, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
project = files.GetParentFolderName(WScript.ScriptFullName)
startScript = files.BuildPath(files.BuildPath(project, "scripts"), "start-window.ps1")
powerShell = files.BuildPath(shell.ExpandEnvironmentStrings("%SystemRoot%"), "System32\WindowsPowerShell\v1.0\powershell.exe")

If Not files.FileExists(startScript) Or Not files.FileExists(powerShell) Then
    MsgBox "MediaSlim X launcher files are missing. Run it from the full project folder.", vbCritical, "MediaSlim X"
    WScript.Quit 1
End If

dataDir = ""
port = ""
If WScript.Arguments.Count Mod 2 <> 0 Then InvalidArguments
For i = 0 To WScript.Arguments.Count - 1 Step 2
    value = WScript.Arguments(i + 1)
    If InStr(value, Chr(34)) > 0 Then InvalidArguments
    Select Case LCase(WScript.Arguments(i))
        Case "-datadir"
            If Len(value) = 0 Or Len(dataDir) > 0 Then InvalidArguments
            dataDir = value
        Case "-port"
            If Len(port) > 0 Or Len(value) = 0 Or Len(value) > 5 Then InvalidArguments
            For digit = 1 To Len(value)
                If Mid(value, digit, 1) < "0" Or Mid(value, digit, 1) > "9" Then InvalidArguments
            Next
            If CLng(value) < 1024 Or CLng(value) > 65535 Then InvalidArguments
            port = CStr(CLng(value))
        Case Else
            InvalidArguments
    End Select
Next

command = Quote(powerShell) & " -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Quote(startScript)
If Len(dataDir) > 0 Then command = command & " -DataDir " & Quote(dataDir)
If Len(port) > 0 Then command = command & " -Port " & port
result = shell.Run(command, 0, True)
If result <> 0 Then
    MsgBox "Startup preparation failed. Run Start-MediaSlimX.cmd for the detailed error.", vbCritical, "MediaSlim X"
End If
WScript.Quit result

Function Quote(text)
    Quote = Chr(34) & text & Chr(34)
End Function

Sub InvalidArguments
    MsgBox "Only -DataDir path and -Port number are supported.", vbExclamation, "MediaSlim X"
    WScript.Quit 2
End Sub
