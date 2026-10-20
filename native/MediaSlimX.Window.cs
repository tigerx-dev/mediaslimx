// Thin Windows host. Python owns media access and service lifecycle decisions.
// Bounded messages accept an actual dropped directory and answer a host-issued
// close prompt. No host objects, arbitrary path/command API or media processing.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class BufferedPanel : Panel
{
    public BufferedPanel() { DoubleBuffered = true; ResizeRedraw = true; }
}

internal sealed class StartupActionButton : Button
{
    private bool hovered, pressed;
    public Color BorderColor { get; set; }
    public Color HoverColor { get; set; }
    public Color PressedColor { get; set; }
    public Color CanvasColor { get; set; }

    public StartupActionButton()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                 ControlStyles.UserPaint, true);
        Cursor = Cursors.Hand;
        TabStop = true;
    }

    protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovered = pressed = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { if (e.Button == MouseButtons.Left) pressed = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
    protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        // WinForms otherwise leaves native square-button pixels in the rounded
        // corners, especially in off-screen captures and on the light theme.
        e.Graphics.Clear(CanvasColor);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        Color fill = !Enabled ? BackColor : pressed ? PressedColor : hovered ? HoverColor : BackColor;
        using (GraphicsPath shape = RoundedRectangle(new RectangleF(0.75f, 0.75f, Width - 1.5f, Height - 1.5f), 8f))
        using (SolidBrush brush = new SolidBrush(fill))
        {
            e.Graphics.FillPath(brush, shape);
            if (BorderColor.A > 0)
                using (Pen border = new Pen(BorderColor)) e.Graphics.DrawPath(border, shape);
        }
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        if (Focused && ShowFocusCues)
            using (GraphicsPath focus = RoundedRectangle(new RectangleF(3.5f, 3.5f, Width - 7f, Height - 7f), 5f))
            using (Pen edge = new Pen(ForeColor, 1f)) e.Graphics.DrawPath(edge, focus);
    }

    private static GraphicsPath RoundedRectangle(RectangleF rect, float radius)
    {
        float diameter = radius * 2f;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(rect.Left, rect.Top, diameter, diameter, 180, 90);
        path.AddArc(rect.Right - diameter, rect.Top, diameter, diameter, 270, 90);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class MediaSlimWindow : Form
{
    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmBorderColor = 34;
    private const int DwmCaptionColor = 35;
    private const int DwmTextColor = 36;
    private static readonly object OutputLock = new object();
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    private static StreamWriter Output;
    private readonly string startUrl, profile, windowKey, appVersion;
    private readonly Uri origin;
    private readonly int parentPid;
    private readonly WebView2 browser = new WebView2();
    private readonly Panel cover = new BufferedPanel();
    private readonly Panel startupContent = new BufferedPanel();
    private readonly Label startupEyebrow = new Label();
    private readonly Label productName = new Label();
    private Rectangle titleMarkBounds;
    private readonly Label mediaScope = new Label();
    private readonly Label versionLabel = new Label();
    private readonly Button repositoryButton = new Button();
    private readonly ToolTip repositoryTip = new ToolTip();
    private readonly Label originByLabel = new Label();
    private readonly PictureBox originLogo = new PictureBox();
    private readonly Label status = new Label();
    private readonly Label failureDetail = new Label();
    private readonly Button languageButton = new Button();
    private readonly StartupActionButton retryButton = new StartupActionButton();
    private readonly StartupActionButton exitButton = new StartupActionButton();
    private bool allowClose, closePending, ready, ownerEnded;
    private readonly HashSet<string> directoryRequests = new HashSet<string>();
    private bool webUiReady, closeUiShown, nativeClosePrompt, shuttingDown;
    private bool navigationCompleted, workspaceReady, browserInitialized, startupFailed, startupRetrying, startupLoading;
    private string closeRequestId, startupFailureReason = "window", windowLanguage = CultureInfo.CurrentUICulture.Name.StartsWith("en", StringComparison.OrdinalIgnoreCase) ? "en" : "zh-CN", windowTheme = "dark";
    private System.Windows.Forms.Timer closeUiTimer;
    private System.Windows.Forms.Timer ownerTimer;
    private System.Windows.Forms.Timer startupTimer;
    private System.Windows.Forms.Timer startupWatchdog;
    private System.Windows.Forms.Timer activityTimer;
    private int activityOffset;
    private readonly Stopwatch ambientClock = new Stopwatch();
    private readonly bool clientAnimationsEnabled = ClientAreaAnimationsEnabled();
    private int ambientFrame;

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetProp(IntPtr hwnd, string name, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr RemoveProp(IntPtr hwnd, string name);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SystemParametersInfo(uint action, uint parameter, ref int value, uint flags);
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private static int ColorRef(Color color)
    {
        return color.R | (color.G << 8) | (color.B << 16);
    }

    private void ApplyNativeTitleBar()
    {
        if (!IsHandleCreated) return;
        bool light = windowTheme == "light";
        int dark = light ? 0 : 1;
        try
        {
            DwmSetWindowAttribute(Handle, DwmUseImmersiveDarkMode, ref dark, sizeof(int));
            // Exact caption colors are supported on Windows 11; older systems
            // keep the standard dark/light system caption and controls.
            int caption = ColorRef(light ? Color.FromArgb(237, 241, 244) : Color.FromArgb(21, 24, 29));
            int text = ColorRef(light ? Color.FromArgb(36, 48, 58) : Color.FromArgb(237, 241, 245));
            int border = ColorRef(light ? Color.FromArgb(203, 213, 221) : Color.FromArgb(51, 60, 71));
            DwmSetWindowAttribute(Handle, DwmCaptionColor, ref caption, sizeof(int));
            DwmSetWindowAttribute(Handle, DwmTextColor, ref text, sizeof(int));
            DwmSetWindowAttribute(Handle, DwmBorderColor, ref border, sizeof(int));
        }
        catch (DllNotFoundException) { }
        catch (EntryPointNotFoundException) { }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyNativeTitleBar();
    }

    private static bool ClientAreaAnimationsEnabled()
    {
        int enabled = 1;
        // Respect the Windows "Show animations" preference. If the query is
        // unavailable, keep the existing activity cue rather than hiding it.
        return !SystemParametersInfo(0x1042, 0, ref enabled, 0) || enabled != 0;
    }

    private MediaSlimWindow(Dictionary<string, object> command)
    {
        startUrl = RequiredString(command, "url");
        profile = RequiredString(command, "profile");
        windowKey = RequiredString(command, "window_key");
        object versionValue;
        string suppliedVersion = command.TryGetValue("app_version", out versionValue) ? versionValue as string : null;
        appVersion = !String.IsNullOrEmpty(suppliedVersion) && Regex.IsMatch(suppliedVersion, "^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$") ? suppliedVersion : "";
        parentPid = Convert.ToInt32(command["parent_pid"]);
        Uri address;
        if (!Uri.TryCreate(startUrl, UriKind.Absolute, out address) || address.Scheme != "http" || address.Host != "127.0.0.1" || address.Port < 1024 || address.Port > 65535 || address.AbsolutePath != "/" || address.UserInfo != "" || address.Query != "" || !Regex.IsMatch(address.Fragment, "^#token=[A-Za-z0-9_-]{32,200}$"))
            throw new ArgumentException("Invalid local window address.");
        if (!Path.IsPathRooted(profile) || parentPid <= 0 || !Regex.IsMatch(windowKey, "^MediaSlimX\\.Window\\.[a-f0-9]{16,128}$"))
            throw new ArgumentException("Invalid window ownership settings.");
        profile = Path.GetFullPath(profile);
        origin = new Uri(address.GetLeftPart(UriPartial.Authority));
        Text = "MediaSlim X";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1280, 820);
        MinimumSize = new Size(900, 600);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(21, 25, 30);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Opacity = 0;
        browser.Dock = DockStyle.Fill;
        browser.DefaultBackgroundColor = BackColor;
        browser.AllowExternalDrop = true;
        Controls.Add(browser);
        cover.Dock = DockStyle.Fill;
        cover.BackColor = BackColor;
        cover.Paint += PaintStartupBackdrop;
        startupContent.Size = new Size(650, 350);
        startupContent.Paint += PaintStartupContent;
        cover.Resize += delegate { CenterStartupContent(); cover.Invalidate(); };
        startupEyebrow.Bounds = new Rectangle(0, 36, 650, 28);
        startupEyebrow.Font = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold);
        startupEyebrow.TextAlign = ContentAlignment.MiddleCenter;
        productName.Bounds = new Rectangle(0, 70, 600, 72);
        productName.Text = "MediaSlim";
        productName.Font = new Font("Microsoft YaHei UI", 38f, FontStyle.Bold);
        productName.TextAlign = ContentAlignment.MiddleLeft;
        mediaScope.Bounds = new Rectangle(0, 149, 650, 40);
        mediaScope.Font = new Font("Microsoft YaHei UI", 15f);
        mediaScope.TextAlign = ContentAlignment.MiddleCenter;
        status.Bounds = new Rectangle(0, 266, 650, 42);
        status.Font = new Font("Microsoft YaHei UI", 11f);
        status.TextAlign = ContentAlignment.MiddleCenter;
        failureDetail.Bounds = new Rectangle(0, 250, 650, 56);
        failureDetail.Font = new Font("Microsoft YaHei UI", 10.5f);
        failureDetail.TextAlign = ContentAlignment.TopCenter;
        failureDetail.Visible = false;
        languageButton.Bounds = new Rectangle(610, 2, 58, 44);
        languageButton.FlatStyle = FlatStyle.Flat;
        languageButton.Font = new Font("Microsoft YaHei UI", 10f);
        languageButton.Click += delegate {
            windowLanguage = windowLanguage == "en" ? "zh-CN" : "en";
            ApplyWindowTheme();
            if (startupFailed) ShowStartupFailure(startupFailureReason, false);
            else if (!shuttingDown) ShowLoading();
        };
        retryButton.Bounds = new Rectangle(0, 312, 154, 44);
        exitButton.Bounds = new Rectangle(166, 312, 154, 44);
        foreach (Button button in new[] { retryButton, exitButton }) {
            button.Font = new Font("Microsoft YaHei UI", 10f);
            button.Visible = false;
        }
        retryButton.Click += async delegate { await RetryStartup(); };
        exitButton.Click += delegate { Close(); };
        startupContent.Controls.Add(startupEyebrow);
        startupContent.Controls.Add(productName);
        startupContent.Controls.Add(mediaScope);
        startupContent.Controls.Add(status);
        startupContent.Controls.Add(failureDetail);
        startupContent.Controls.Add(retryButton);
        startupContent.Controls.Add(exitButton);
        cover.Controls.Add(startupContent);
        cover.Controls.Add(languageButton);
        versionLabel.Font = new Font("Microsoft YaHei UI", 10f);
        versionLabel.TextAlign = ContentAlignment.MiddleLeft;
        cover.Controls.Add(versionLabel);
        repositoryButton.FlatStyle = FlatStyle.Flat;
        repositoryButton.Cursor = Cursors.Hand;
        repositoryButton.Font = versionLabel.Font;
        repositoryButton.ImageAlign = ContentAlignment.MiddleLeft;
        repositoryButton.TextAlign = ContentAlignment.MiddleRight;
        repositoryButton.TextImageRelation = TextImageRelation.ImageBeforeText;
        repositoryButton.Click += delegate {
            try {
                Process.Start(new ProcessStartInfo("https://github.com/tigerx-dev/mediaslimx") { UseShellExecute = true });
            }
            catch (Exception) {
                MessageBox.Show("https://github.com/tigerx-dev/mediaslimx", "GitHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        };
        cover.Controls.Add(repositoryButton);
        originByLabel.Font = versionLabel.Font;
        originByLabel.TextAlign = ContentAlignment.MiddleRight;
        originByLabel.Text = "by";
        cover.Controls.Add(originByLabel);
        originLogo.SizeMode = PictureBoxSizeMode.Zoom;
        cover.Controls.Add(originLogo);
        Controls.Add(cover);
        ApplyWindowTheme();
        ShowLoading();
        Shown += async delegate
        {
            // WinForms has applied display scaling by this point. Keep the
            // complete frame inside the current monitor's usable work area,
            // including on short laptop screens or with a large DPI setting.
            Rectangle work = Screen.FromControl(this).WorkingArea;
            MinimumSize = new Size(Math.Min(900, work.Width), Math.Min(600, work.Height));
            Size = new Size(Math.Min(Width, work.Width), Math.Min(Height, work.Height));
            Location = new Point(work.Left + (work.Width - Width) / 2, work.Top + (work.Height - Height) / 2);
            CenterStartupContent();
            startupTimer = new System.Windows.Forms.Timer { Interval = 240 };
            startupTimer.Tick += delegate { StopStartupTimer(); if (!ready) RevealWindow(); };
            startupTimer.Start();
            StartStartupWatchdog();
            await InitializeBrowser();
        };
        FormClosing += OnClosing;
        FormClosed += delegate { RemoveProp(Handle, windowKey); StopCloseTimer(); StopStartupTimer(); StopStartupWatchdog(); StopActivity(); if (activityTimer != null) activityTimer.Dispose(); browser.Dispose(); if (repositoryButton.Image != null) repositoryButton.Image.Dispose(); if (originLogo.Image != null) originLogo.Image.Dispose(); repositoryTip.Dispose(); if (ownerTimer != null) ownerTimer.Dispose(); };
    }

    private static string RequiredString(Dictionary<string, object> command, string key)
    {
        object value;
        if (!command.TryGetValue(key, out value) || !(value is string) || String.IsNullOrWhiteSpace((string)value))
            throw new ArgumentException("Missing window startup setting.");
        return (string)value;
    }

    // Bound input without ReadLine allocating an unlimited parent command.
    private static string ReadCommand(TextReader input)
    {
        StringBuilder line = new StringBuilder();
        for (int value; (value = input.Read()) != -1; )
        {
            if (value == '\n') return line.ToString().TrimEnd('\r');
            if (line.Length >= 65536) throw new InvalidDataException("Window command exceeds 64 KiB.");
            line.Append((char)value);
        }
        return line.Length == 0 ? null : line.ToString();
    }

    private static void Emit(string name, Dictionary<string, object> extra)
    {
        lock (OutputLock)
        {
            try
            {
                Dictionary<string, object> item = extra ?? new Dictionary<string, object>();
                item["event"] = name;
                Output.WriteLine(Json.Serialize(item));
                Output.Flush();
            }
            catch (IOException) { }
        }
    }

    private void Dispatch(Action action)
    {
        if (IsDisposed || Disposing) return;
        try { BeginInvoke(action); } catch (InvalidOperationException) { }
    }

    private void CenterStartupContent()
    {
        // Brand and purpose form one compact group; state, reason and actions
        // form another. Failure actions follow the reason, leaving space below.
        int width = Math.Min(650, Math.Max(360, cover.ClientSize.Width - 96));
        int innerWidth = Math.Max(280, width - 80);
        int reasonHeight = startupFailed ? Math.Max(52, TextRenderer.MeasureText(failureDetail.Text,
            failureDetail.Font, new Size(innerWidth, 1000),
            TextFormatFlags.WordBreak | TextFormatFlags.NoPadding).Height + 8) : 52;
        int actionTop = 250 + reasonHeight + 10;
        startupContent.Height = startupFailed ? Math.Max(400, actionTop + 44 + 44)
            : startupLoading ? 350 : 400;
        startupContent.Width = width;
        startupContent.Left = Math.Max(0, (cover.ClientSize.Width - width) / 2);
        startupContent.Top = Math.Max(8, (cover.ClientSize.Height - startupContent.Height) / 2);
        startupEyebrow.Width = width;
        startupEyebrow.Top = 36;
        productName.Top = 70;
        int titleWidth = TextRenderer.MeasureText(productName.Text, productName.Font,
            new Size(640, productName.Height), TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Width;
        int titleMarkSize = 52;
        productName.Width = Math.Min(titleWidth + 4, width - titleMarkSize - 6);
        productName.Left = (width - productName.Width - titleMarkSize - 6) / 2;
        titleMarkBounds = new Rectangle(productName.Right + 6,
            productName.Top + (productName.Height - titleMarkSize) / 2,
            titleMarkSize, titleMarkSize);
        mediaScope.Top = 149;
        mediaScope.Width = width;
        languageButton.SetBounds(cover.ClientSize.Width - 100, 32, 58, 44);
        status.SetBounds(32, startupLoading ? 266 : 211, width - 64, startupFailed ? 38 : status.Height);
        failureDetail.SetBounds(40, 250, innerWidth, reasonHeight);
        retryButton.Top = exitButton.Top = actionTop;
        retryButton.Left = (width - retryButton.Width - exitButton.Width - 12) / 2;
        exitButton.Left = retryButton.Right + 12;
        versionLabel.SetBounds(48, cover.ClientSize.Height - 68, 116, 44);
        repositoryButton.SetBounds(170, cover.ClientSize.Height - 68, 110, 44);
        originLogo.SetBounds(cover.ClientSize.Width - 96, cover.ClientSize.Height - 60, 48, 24);
        originByLabel.SetBounds(originLogo.Left - 44, cover.ClientSize.Height - 68, 36, 44);
        cover.Invalidate();
        startupContent.Invalidate();
    }

    private void PaintStartupContent(object sender, PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        bool light = windowTheme == "light";
        using (GraphicsPath card = RoundedCard(new RectangleF(1, 1, startupContent.Width - 2,
                                                              startupContent.Height - 2), 20))
        using (SolidBrush surface = new SolidBrush(light ? Color.White : Color.FromArgb(29, 34, 41)))
        using (Pen edge = new Pen(light ? Color.FromArgb(203, 213, 221) : Color.FromArgb(51, 60, 71)))
        {
            e.Graphics.FillPath(surface, card);
            e.Graphics.DrawPath(edge, card);
        }
        // Paint the mark with the card. A transparent child Panel can be
        // captured before its Paint event and appear as an empty dark square.
        using (SolidBrush mark = new SolidBrush(startupEyebrow.ForeColor))
            DrawTxMark(e.Graphics, mark, titleMarkBounds);
        if (!startupLoading) return;
        int trackLeft = (startupContent.Width - 180) / 2;
        using (SolidBrush track = new SolidBrush(light ? Color.FromArgb(203, 213, 221) : Color.FromArgb(51, 60, 71)))
            e.Graphics.FillRectangle(track, trackLeft, 251, 180, 2);
        if (!clientAnimationsEnabled) return;
        GraphicsState clipped = e.Graphics.Save();
        e.Graphics.SetClip(new Rectangle(trackLeft, 251, 180, 2));
        using (SolidBrush segment = new SolidBrush(light ? Color.FromArgb(36, 108, 72) : Color.FromArgb(180, 237, 198)))
            e.Graphics.FillRectangle(segment, trackLeft + activityOffset - 50, 251, 50, 2);
        e.Graphics.Restore(clipped);
    }

    private void PaintStartupBackdrop(object sender, PaintEventArgs e)
    {
        bool light = windowTheme == "light";
        Rectangle bounds = cover.ClientRectangle;
        if (bounds.Width <= 0 || bounds.Height <= 0) return;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(light ? Color.FromArgb(237, 241, 244) : Color.FromArgb(21, 24, 29));
        DrawSoftGlow(e.Graphics, bounds.Width / 2f, bounds.Height / 2f,
            360f, light ? Color.FromArgb(16, 36, 108, 72) : Color.FromArgb(18, 180, 237, 198));
        if (startupLoading) DrawBottomAmbient(e.Graphics, bounds, light);
        using (GraphicsPath shadow = RoundedCard(new RectangleF(startupContent.Left,
            startupContent.Top + 14, startupContent.Width, startupContent.Height), 20))
        using (SolidBrush shade = new SolidBrush(light ? Color.FromArgb(12, 36, 48, 58) : Color.FromArgb(22, 0, 0, 0)))
            e.Graphics.FillPath(shade, shadow);
    }

    private void DrawBottomAmbient(Graphics graphics, Rectangle bounds, bool light)
    {
        // A single low-contrast light field stays beneath the card and footer.
        // It moves only during actual startup waiting; no value suggests progress.
        double phase = clientAnimationsEnabled ? ambientClock.Elapsed.TotalSeconds * Math.PI / 3d : 0d;
        float x = bounds.Width * (0.5f + 0.12f * (float)Math.Sin(phase));
        float radiusX = Math.Min(580f, bounds.Width * 0.48f);
        float radiusY = Math.Max(190f, Math.Min(290f, bounds.Height * 0.34f));
        float y = bounds.Bottom + 28f;
        using (GraphicsPath area = new GraphicsPath())
        {
            area.AddEllipse(x - radiusX, y - radiusY, radiusX * 2f, radiusY * 2f);
            using (PathGradientBrush glow = new PathGradientBrush(area))
            {
                Color tint = light ? Color.FromArgb(26, 36, 108, 72) : Color.FromArgb(32, 180, 237, 198);
                glow.CenterColor = tint;
                glow.SurroundColors = new[] { Color.FromArgb(0, tint.R, tint.G, tint.B) };
                graphics.FillPath(glow, area);
            }
        }
    }

    private static void DrawSoftGlow(Graphics graphics, float x, float y, float radius, Color tint)
    {
        using (GraphicsPath area = new GraphicsPath())
        {
            area.AddEllipse(x - radius, y - radius, radius * 2, radius * 2);
            using (PathGradientBrush glow = new PathGradientBrush(area))
            {
                glow.CenterColor = tint;
                glow.SurroundColors = new[] { Color.FromArgb(0, tint.R, tint.G, tint.B) };
                graphics.FillPath(glow, area);
            }
        }
    }

    private static GraphicsPath RoundedCard(RectangleF rect, float radius)
    {
        float size = radius * 2;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(rect.Left, rect.Top, size, size, 180, 90);
        path.AddArc(rect.Right - size, rect.Top, size, size, 270, 90);
        path.AddArc(rect.Right - size, rect.Bottom - size, size, size, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - size, size, size, 90, 90);
        path.CloseFigure();
        return path;
    }

    private const string OriginLogoData =
        "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";
    private const string RepositoryLogoData =
        "iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAE4ElEQVR4nMxYXWhbZRh+3y9p1rRN0vVnTUOmw5U1yXZR/KO4i1UdCIqrMt2VN0OF" +
        "MUW9sKA3VRBRQS/8QVGGiCDiGHRYJ0NQ24GiTtmEepJ2ExRGfpq0y0nSGtOc7/U9WZs0ac5Jm2SyB3Jyvu/9e857vp/3O1a4wWCFOuEY9OwXSG6+" +
        "7QbALkAgAFpAgkUp6EpKif4CdQC3otzp73+YAI9w7PsB0WmmSwQLrHdGSvg8NRs5C80k5PL338qKnzKJvVAPiM7l83AscykSrKVqTsjrtbsc2juI" +
        "+AQ0AUTyDTUYfQHqIdTpc+8igV8joB+aCH6VP0kNHkzPhROwWUJM5gAI/IrFHXAdQEBRDehgRon+AbUIdQy4ey02EWJBF1xH8JS8rC5oQxCLLa3v" +
        "F5WKVpuY2ECGIMK5nuZ0Z2HroZcLtpyV9b0cY8DVLT6p1C4j1BnwvMx/+yuVJNJYMhgZkYRefrK3ysIR6WPhIv//yr94qR+y3H6VMste3RYlbRjM" +
        "PD4f6Qy4j5b3rcK+27PTZoM5RGitNNRkbjAdSsyttV2BvnuRLA6JmXMpJbVYqe/Y4/HlZTbzz+XFK6WH7R0CaLlQqcuZm1e1lQGYTaT1dnGlZjJv" +
        "ViNTgLSVBVWV2LdgAp5Boco+Ld+StVTZFzhLO1xoG1cBxvR24ZXZB7q8TOYIGEHkGh7gFpT9RjIUdLwYSr+0tNhGwQSEFhs0CN5y0sZSbHP63Q8U" +
        "CSGIhwwdEXyQCcZmoEGosxF90J8wkvOrGy0RQjhoqKjlP4QmgTT6yFCIeHeBkOsm13ZDBzwDknPzv0OTkJqLnmevmWoyfV0qEJL29h0mPv6CpgP/" +
        "NJK0+Xv6BWDeeAZR/QWcCchIYNWsXmERVpPtAG+GptOhW4xEAmROMJsFIwUe7N0dAXd9RVkVuHz9t5lVmv/K/ILILofnzZxYCZ+EZgHhmJlY32oE" +
        "D1t9E/zN2Ak+6wy474QGUdj/zCvPH/SLWA06ZaKoL5xnC+muE1zwjbCP02Y6nJSpIiEi7RSYEoLtKGDK6fM8DVvBLmh1+tzjIMT3tarPvNROrsa6" +
        "Bj7izBRPFUQzfHwZEwLs3Pc29+wsWhKE+XKSpJxUZ2PfVXOu70uI4jASHa51XLoWjn5Wg5Fh/b5YoBHCeyUV3C0E3sWF1YSEDNcxpJRE4OEgz4FF" +
        "HIe+vvYNZALOLl7cXuMnPboZMpWxy2rqsiwxJMAzKSX8rsPXs0eg7Ud9GVh9ohP8RIazz6gYq0qGK032dcdaW1RIn1rf5GPxSzDY49CrRTUt9Nf2" +
        "eB7kPjMyOpJK/CLvg+dhM4S0Ui2kw7K+kU1k/m7tdei3IwVCCG2taPFkE+nTkErls/H0hVw8E4dNwN7j2MsOhs215PNqKHrKkFCBVDw9va23Yx/X" +
        "J4FCB8KQ3m5xtk/nri4twSZh63XczuvOPcYa9FlSiY5V9opqqqoSeZRT/vpaWz8dWLdZYi6/J8TjbMoV8HwMjYDglaQSeayaSBjZMKkXNQ1G2Vgt" +
        "EkMY5MsB/qpRb42d1KR2KBkMjxspCDPr9Gz4yxVc8fHt5Pp+Lmsl1ABndaXchr7JUS6QDsUmzexMCelYUuLRpBI+lF+hABN5n4uZqxzuTC07SbkJ" +
        "1r/Evy8kaMM8M+9bDiYitey29MHq/8B/AAAA//9gAnFoAAAABklEQVQDAIhF5vBdRxznAAAAAElFTkSuQmCC";

    private static Image LoadTintedLogo(bool originMark, Color color)
    {
        byte[] bytes = Convert.FromBase64String(originMark ? OriginLogoData : RepositoryLogoData);
        using (MemoryStream stream = new MemoryStream(bytes))
        using (Bitmap source = new Bitmap(stream))
        {
            Bitmap result = new Bitmap(source.Width, source.Height);
            for (int y = 0; y < source.Height; y++)
                for (int x = 0; x < source.Width; x++)
                {
                    byte alpha = source.GetPixel(x, y).A;
                    if (alpha != 0) result.SetPixel(x, y, Color.FromArgb(alpha, color.R, color.G, color.B));
                }
            return result;
        }
    }

    private static void DrawTxMark(Graphics graphics, Brush brush, RectangleF bounds)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        float scale = Math.Min(bounds.Width / 220f, bounds.Height / 210f);
        float markX = bounds.X + (bounds.Width - 220f * scale) / 2f;
        float markY = bounds.Y + (bounds.Height - 210f * scale) / 2f;
        PointF[][] shapes = {
                new[] { new PointF(0, 0), new PointF(80, 105), new PointF(0, 210), new PointF(60, 210), new PointF(140, 105), new PointF(60, 0) },
                new[] { new PointF(152.5f, 88.59375f), new PointF(220, 0), new PointF(160, 0), new PointF(122.5f, 49.21875f) },
                new[] { new PointF(152.5f, 121.40625f), new PointF(220, 210), new PointF(160, 210), new PointF(122.5f, 160.78125f) },
                new[] { new PointF(92.5f, 121.40625f), new PointF(80, 105), new PointF(92.5f, 88.59375f), new PointF(105, 105) }
        };
        foreach (PointF[] shape in shapes) {
            for (int i = 0; i < shape.Length; i++)
                shape[i] = new PointF(markX + shape[i].X * scale, markY + shape[i].Y * scale);
            // The original TX shapes overlap at the center and need separate
            // fills; a single alternate-fill path would cut a diamond out.
            graphics.FillPolygon(brush, shape);
        }
    }

    private void RevealWindow()
    {
        if (Opacity >= 1) return;
        Opacity = 1;
    }

    private void StopStartupTimer()
    {
        if (startupTimer == null) return;
        startupTimer.Stop();
        startupTimer.Dispose();
        startupTimer = null;
    }

    // The line and bottom light are indeterminate activity cues, never a
    // percentage. The 240 ms visibility threshold remains unchanged.
    private void StartActivity()
    {
        ambientClock.Restart();
        ambientFrame = 0;
        cover.Invalidate();
        if (!clientAnimationsEnabled) return;
        if (activityTimer == null)
        {
            activityTimer = new System.Windows.Forms.Timer { Interval = 45 };
            activityTimer.Tick += delegate {
                if (!startupLoading || Opacity < 1 || !cover.Visible) return;
                activityOffset = (activityOffset + 5) % 230;
                startupContent.Invalidate(new Rectangle((startupContent.Width - 180) / 2, 250, 180, 4));
                // A soft glow needs fewer frames than the short activity line.
                if (++ambientFrame % 2 == 0)
                    cover.Invalidate(new Rectangle(0, Math.Max(0, cover.Height - 290),
                                                   cover.Width, Math.Min(290, cover.Height)));
            };
        }
        activityOffset = 66;
        activityTimer.Start();
        startupContent.Invalidate();
    }

    private void StopActivity()
    {
        if (activityTimer != null) activityTimer.Stop();
        ambientClock.Stop();
        cover.Invalidate();
        startupContent.Invalidate();
    }

    private void StartStartupWatchdog()
    {
        StopStartupWatchdog();
        startupWatchdog = new System.Windows.Forms.Timer { Interval = 30000 };
        startupWatchdog.Tick += delegate {
            StopStartupWatchdog();
            if (!ready && !startupFailed && !shuttingDown) ShowStartupFailure("timeout");
        };
        startupWatchdog.Start();
    }

    private void StopStartupWatchdog()
    {
        if (startupWatchdog == null) return;
        startupWatchdog.Stop();
        startupWatchdog.Dispose();
        startupWatchdog = null;
    }

    private void ShowLoading()
    {
        startupFailed = false;
        startupLoading = true;
        startupContent.Height = 350;
        status.Height = 48;
        CenterStartupContent();
        status.Text = LocalText("正在启动本地工作台…", "Starting the local workspace…");
        failureDetail.Visible = retryButton.Visible = exitButton.Visible = false;
        cover.Show();
        cover.BringToFront();
        StartActivity();
    }

    private void ShowStatus(string text)
    {
        startupLoading = false;
        startupContent.Height = 400;
        status.Height = 90;
        CenterStartupContent();
        status.Text = text;
        failureDetail.Visible = retryButton.Visible = exitButton.Visible = false;
        StopActivity();
        cover.Show();
        cover.BringToFront();
    }

    private void ShowStartupFailure(string reason, bool report = true, string diagnostic = null)
    {
        if (shuttingDown || ownerEnded) return;
        startupFailureReason = reason;
        startupFailed = true;
        startupLoading = false;
        startupRetrying = false;
        startupContent.Height = 400;
        status.Height = 42;
        status.Text = LocalText("本地工作台未能启动", "The local workspace could not start");
        failureDetail.Text = reason == "runtime" ? LocalText(
            "未找到 Microsoft Edge WebView2 Runtime。安装或修复后可重试；不会自动下载安装。",
            "Microsoft Edge WebView2 Runtime is missing. Install or repair it, then retry. Nothing is installed automatically.")
            : reason == "profile" ? LocalText(
            "窗口数据目录无法访问。请检查当前账户的目录权限后重试。",
            "The window data folder is not accessible. Check this account's folder permissions, then retry.")
            : reason == "navigation" ? LocalText(
            "本机服务的界面未能加载。请检查本机服务后重试。",
            "The local service page did not load. Check the local service, then retry.")
            : reason == "workspace" ? LocalText(
            "界面已打开，但工作台数据初始化失败。请重试；仍失败时查看 window.log。",
            "The page opened, but workspace data did not initialize. Retry or check window.log if it persists.")
            : reason == "timeout" ? LocalText(
            "本地工作台等待响应超时。请重试；仍失败时查看 window.log。",
            "The local workspace did not respond in time. Retry or check window.log if it persists.")
            : reason == "register" ? LocalText(
            "窗口登记失败。请重试；仍失败时重新启动程序。",
            "Window registration failed. Retry or restart the app if it persists.")
            : LocalText(
            "窗口组件未能初始化。请检查 WebView2 Runtime 和 window.log 后重试。",
            "The window component did not initialize. Check WebView2 Runtime and window.log, then retry.");
        CenterStartupContent();
        failureDetail.Visible = retryButton.Visible = exitButton.Visible = true;
        StopActivity();
        retryButton.Text = LocalText("重试", "Retry");
        exitButton.Text = LocalText("退出", "Exit");
        cover.Show();
        cover.BringToFront();
        StopStartupTimer();
        StopStartupWatchdog();
        RevealWindow();
        retryButton.Focus();
        if (report) Emit("startup_failed", new Dictionary<string, object> { { "reason", reason }, { "diagnostic", diagnostic ?? "" } });
    }

    private async Task RetryStartup()
    {
        if (!startupFailed || startupRetrying || shuttingDown || ownerEnded) return;
        startupRetrying = true;
        navigationCompleted = workspaceReady = webUiReady = false;
        ShowLoading();
        StartStartupWatchdog();
        Emit("startup_retry", null);
        try {
            if (browserInitialized && browser.CoreWebView2 != null) browser.CoreWebView2.Reload();
            else await InitializeBrowser();
        } catch (Exception) { ShowStartupFailure("navigation"); }
        finally { startupRetrying = false; }
    }

    private void TryPresentWorkspace()
    {
        if (ready || startupFailed || shuttingDown || ownerEnded || !navigationCompleted || !workspaceReady || !webUiReady) return;
        if (!SetProp(Handle, windowKey, new IntPtr(1))) { ShowStartupFailure("register"); return; }
        ready = true;
        startupLoading = false;
        StopActivity();
        browser.Enabled = true;
        cover.Hide();
        StopStartupTimer();
        StopStartupWatchdog();
        RevealWindow();
        Emit("ready", new Dictionary<string, object> { { "hwnd", Handle.ToInt64() }, { "pid", Process.GetCurrentProcess().Id } });
    }

    private bool LocalAddress(string value)
    {
        Uri address;
        return Uri.TryCreate(value, UriKind.Absolute, out address) && address.Scheme == origin.Scheme && address.Host == origin.Host && address.Port == origin.Port && address.UserInfo == "";
    }

    private bool TopDocumentAddress(string value)
    {
        Uri address;
        return LocalAddress(value) && Uri.TryCreate(value, UriKind.Absolute, out address)
            && address.AbsolutePath == "/" && address.Query == "";
    }

    private void PostDirectoryResult(string requestId, string path, string error)
    {
        if (browser.CoreWebView2 == null || !TopDocumentAddress(browser.CoreWebView2.Source)) return;
        Dictionary<string, object> result = new Dictionary<string, object> {
            { "type", "mediaslimx-directory-drop" }, { "request_id", requestId }
        };
        if (path != null) result["path"] = path;
        else result["error"] = error;
        try { browser.CoreWebView2.PostWebMessageAsJson(Json.Serialize(result)); }
        catch (Exception) { } // Navigation/close must not turn a rejected drop into a fatal host error.
    }

    private string LocalText(string chinese, string english)
    {
        return windowLanguage == "en" ? english : chinese;
    }

    private void ApplyWindowTheme()
    {
        bool light = windowTheme == "light";
        ApplyNativeTitleBar();
        BackColor = light ? Color.FromArgb(237, 241, 244) : Color.FromArgb(21, 24, 29);
        cover.BackColor = BackColor;
        startupContent.BackColor = Color.Transparent;
        startupEyebrow.ForeColor = light ? Color.FromArgb(36, 108, 72) : Color.FromArgb(180, 237, 198);
        startupEyebrow.Text = LocalText("本地媒体工作台", "LOCAL MEDIA WORKBENCH");
        productName.ForeColor = status.ForeColor = light ? Color.FromArgb(36, 48, 58) : Color.FromArgb(237, 241, 245);
        mediaScope.ForeColor = light ? Color.FromArgb(88, 102, 116) : Color.FromArgb(160, 170, 183);
        mediaScope.Text = LocalText("图片 · MP4 · PDF 批量压缩工具", "Images · MP4 · PDF batch compressor");
        failureDetail.ForeColor = light ? Color.FromArgb(88, 102, 116) : Color.FromArgb(160, 170, 183);
        versionLabel.BackColor = Color.Transparent;
        versionLabel.ForeColor = failureDetail.ForeColor;
        versionLabel.Text = appVersion == "" ? "" : LocalText("版本 ", "Version ") + appVersion;
        repositoryButton.BackColor = Color.Transparent;
        repositoryButton.ForeColor = failureDetail.ForeColor;
        repositoryButton.FlatAppearance.BorderSize = 0;
        repositoryButton.FlatAppearance.MouseOverBackColor = light ? Color.FromArgb(224, 235, 228) : Color.FromArgb(37, 56, 48);
        repositoryButton.FlatAppearance.MouseDownBackColor = repositoryButton.FlatAppearance.MouseOverBackColor;
        repositoryButton.Text = "GitHub";
        repositoryButton.AccessibleName = LocalText("在 GitHub 查看 MediaSlim X 仓库", "Open the MediaSlim X repository on GitHub");
        repositoryTip.SetToolTip(repositoryButton, LocalText("打开 GitHub 仓库", "Open GitHub repository"));
        Color footerInk = light ? Color.FromArgb(36, 74, 53) : Color.FromArgb(160, 170, 183);
        Image oldRepository = repositoryButton.Image, oldOrigin = originLogo.Image;
        using (Image repositorySource = LoadTintedLogo(false, footerInk))
            repositoryButton.Image = new Bitmap(repositorySource, new Size(21, 21));
        originLogo.Image = LoadTintedLogo(true, footerInk);
        if (oldRepository != null) oldRepository.Dispose();
        if (oldOrigin != null) oldOrigin.Dispose();
        originByLabel.BackColor = originLogo.BackColor = Color.Transparent;
        originByLabel.ForeColor = failureDetail.ForeColor;
        CenterStartupContent();
        retryButton.BackColor = light ? Color.FromArgb(36, 108, 72) : Color.FromArgb(180, 237, 198);
        retryButton.CanvasColor = exitButton.CanvasColor = light ? Color.White : Color.FromArgb(29, 34, 41);
        retryButton.ForeColor = light ? Color.White : Color.FromArgb(20, 39, 27);
        retryButton.BorderColor = Color.Transparent;
        retryButton.HoverColor = light ? Color.FromArgb(29, 89, 59) : Color.FromArgb(158, 226, 181);
        retryButton.PressedColor = light ? Color.FromArgb(24, 75, 49) : Color.FromArgb(137, 210, 161);
        exitButton.BackColor = light ? Color.White : Color.FromArgb(29, 34, 41);
        exitButton.ForeColor = productName.ForeColor;
        exitButton.BorderColor = light ? Color.FromArgb(203, 213, 221) : Color.FromArgb(51, 60, 71);
        exitButton.HoverColor = light ? Color.FromArgb(237, 241, 244) : Color.FromArgb(39, 48, 56);
        exitButton.PressedColor = light ? Color.FromArgb(225, 233, 238) : Color.FromArgb(46, 57, 65);
        languageButton.BackColor = BackColor;
        languageButton.ForeColor = light ? Color.FromArgb(88, 102, 116) : Color.FromArgb(160, 170, 183);
        languageButton.FlatAppearance.BorderSize = 0;
        languageButton.FlatAppearance.MouseOverBackColor = light ? Color.White : Color.FromArgb(29, 34, 41);
        languageButton.FlatAppearance.MouseDownBackColor = languageButton.FlatAppearance.MouseOverBackColor;
        languageButton.Text = windowLanguage == "en" ? "中文" : "EN";
        browser.DefaultBackgroundColor = BackColor;
        startupContent.Invalidate();
        cover.Invalidate();
        if (startupLoading) status.Text = LocalText("正在启动本地工作台…", "Starting the local workspace…");
        if (startupFailed) ShowStartupFailureTextOnly();
    }

    private void ShowStartupFailureTextOnly()
    {
        retryButton.Text = LocalText("重试", "Retry");
        exitButton.Text = LocalText("退出", "Exit");
    }

    private bool PostCloseMessage(Dictionary<string, object> message)
    {
        try
        {
            if (browser.CoreWebView2 == null || !TopDocumentAddress(browser.CoreWebView2.Source)) return false;
            browser.CoreWebView2.PostWebMessageAsJson(Json.Serialize(message));
            return true;
        }
        catch (Exception) { return false; }
    }

    private void StopCloseTimer()
    {
        if (closeUiTimer == null) return;
        closeUiTimer.Stop();
        closeUiTimer.Dispose();
        closeUiTimer = null;
    }

    private void InvalidateClosePrompt(bool dismiss)
    {
        string previous = closeRequestId;
        closeRequestId = null;
        closeUiShown = false;
        StopCloseTimer();
        if (dismiss && previous != null)
            PostCloseMessage(new Dictionary<string, object> { { "type", "mediaslimx-close-dismiss" }, { "request_id", previous } });
    }

    private bool PostPendingClosePrompt()
    {
        return closeRequestId != null && PostCloseMessage(new Dictionary<string, object> {
            { "type", "mediaslimx-close-request" }, { "request_id", closeRequestId }, { "busy", true }
        });
    }

    private void NativeCloseConfirmation()
    {
        if (nativeClosePrompt || shuttingDown || ownerEnded) return;
        // Revoke before a native fallback. A late web response cannot authorize
        // an exit, and its delayed dialog receives a matching dismiss message.
        InvalidateClosePrompt(true);
        nativeClosePrompt = true;
        DialogResult answer;
        try
        {
            answer = MessageBox.Show(this, LocalText(
                "任务尚未结束。退出会取消剩余任务，等待当前文件安全收尾；已完成结果与备份保留。\n\n是否安全退出？",
                "Work is still in progress. Exiting cancels remaining work and waits for the current file to finish safely. Completed results and backups are kept.\n\nExit safely?"),
                "MediaSlim X", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
        }
        finally { nativeClosePrompt = false; }
        if (answer == DialogResult.Yes) Emit("close_confirmed", null);
        else { closePending = false; Emit("close_cancelled", null); }
    }

    private void ConfirmClose(bool working)
    {
        if (shuttingDown || ownerEnded || nativeClosePrompt) return;
        closePending = true;
        if (!working) { InvalidateClosePrompt(false); Emit("close_confirmed", null); return; }
        if (closeRequestId != null) { PostPendingClosePrompt(); return; }
        if (!ready || !webUiReady || !browser.Enabled)
        {
            NativeCloseConfirmation();
            return;
        }
        closeRequestId = Guid.NewGuid().ToString("N");
        closeUiShown = false;
        if (!PostPendingClosePrompt()) { NativeCloseConfirmation(); return; }
        // This timeout asks for native confirmation; it never implies consent.
        closeUiTimer = new System.Windows.Forms.Timer { Interval = 3000 };
        closeUiTimer.Tick += delegate
        {
            StopCloseTimer();
            if (closeRequestId != null && !closeUiShown) NativeCloseConfirmation();
        };
        closeUiTimer.Start();
    }

    private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!TopDocumentAddress(e.Source) || !TopDocumentAddress(browser.CoreWebView2.Source)) return;
        string requestId = null;
        try
        {
            string raw = e.WebMessageAsJson;
            if (raw == null || raw.Length > 512) return;
            Dictionary<string, object> message = new JavaScriptSerializer { MaxJsonLength = 512 }
                .Deserialize<Dictionary<string, object>>(raw);
            object operation, identifier;
            if (message == null || !message.TryGetValue("op", out operation) || !(operation is string)) return;
            bool noObjects = e.AdditionalObjects == null || e.AdditionalObjects.Count == 0;
            if ((string)operation == "window_ui_ready")
            {
                object language, theme;
                if (message.Count != 3 || !noObjects || ownerEnded || shuttingDown
                    || !message.TryGetValue("language", out language) || !(language is string)
                    || ((string)language != "zh-CN" && (string)language != "en")
                    || !message.TryGetValue("theme", out theme) || !(theme is string)
                    || ((string)theme != "dark" && (string)theme != "light")) return;
                // Presentation-only handshake: this does not authorize closing.
                windowLanguage = (string)language;
                windowTheme = (string)theme;
                webUiReady = true;
                ApplyWindowTheme();
                TryPresentWorkspace();
                return;
            }
            if ((string)operation == "workspace_ready")
            {
                if (message.Count != 1 || !noObjects || ownerEnded || shuttingDown) return;
                workspaceReady = true;
                TryPresentWorkspace();
                return;
            }
            if ((string)operation == "workspace_failed")
            {
                object language, theme;
                if (message.Count != 3 || !noObjects || ready || ownerEnded || shuttingDown
                    || !message.TryGetValue("language", out language) || !(language is string)
                    || ((string)language != "zh-CN" && (string)language != "en")
                    || !message.TryGetValue("theme", out theme) || !(theme is string)
                    || ((string)theme != "dark" && (string)theme != "light")) return;
                windowLanguage = (string)language;
                windowTheme = (string)theme;
                ApplyWindowTheme();
                ShowStartupFailure("workspace");
                return;
            }
            if ((string)operation == "request_close")
            {
                if (message.Count != 1 || !noObjects || !ready || !webUiReady || ownerEnded || shuttingDown) return;
                Close(); // The normal FormClosing -> Python busy check owns exit.
                return;
            }
            if ((string)operation == "close_response")
            {
                object decision;
                if (message.Count != 3 || !noObjects || !ready || !closePending || nativeClosePrompt || shuttingDown
                    || closeRequestId == null || !message.TryGetValue("request_id", out identifier)
                    || !(identifier is string) || (string)identifier != closeRequestId
                    || !message.TryGetValue("decision", out decision) || !(decision is string)) return;
                if ((string)decision == "shown") { closeUiShown = true; StopCloseTimer(); }
                else if ((string)decision == "stay")
                {
                    InvalidateClosePrompt(false);
                    closePending = false;
                    Emit("close_cancelled", null);
                }
                else if ((string)decision == "exit")
                {
                    InvalidateClosePrompt(false);
                    Emit("close_confirmed", null);
                }
                return;
            }
            // AdditionalObjects supplies a browser-backed File for this fixed
            // operation, never an absolute directory supplied in JSON.
            if (!ready || message.Count != 2 || (string)operation != "dropped_directory"
                || !message.TryGetValue("request_id", out identifier) || !(identifier is string)
                || !Regex.IsMatch((string)identifier, "^[a-f0-9]{32}$")) return;
            requestId = (string)identifier;
            if (closePending || ownerEnded)
            {
                PostDirectoryResult(requestId, null, "正在安全退出，暂不接受拖入目录。");
                return;
            }
            if (directoryRequests.Contains(requestId)) return;
            if (directoryRequests.Count >= 16)
            {
                PostDirectoryResult(requestId, null, "目录扫描请求过多，请稍后重试。");
                return;
            }
            if (e.AdditionalObjects == null || e.AdditionalObjects.Count != 1)
                throw new ArgumentException("Expected one native directory object.");
            CoreWebView2File file = e.AdditionalObjects[0] as CoreWebView2File;
            string path = file == null ? null : file.Path;
            if (String.IsNullOrWhiteSpace(path) || path.Length > 4096 || path.IndexOf('\0') >= 0
                || !Path.IsPathRooted(path) || !Directory.Exists(path))
                throw new ArgumentException("Expected a real local directory.");
            directoryRequests.Add(requestId);
            Emit("directory_dropped", new Dictionary<string, object> { { "path", path }, { "request_id", requestId } });
        }
        catch (Exception)
        {
            if (requestId != null) PostDirectoryResult(requestId, null, "未能识别拖入的本机目录，请使用选择目录。");
        }
    }

    private async Task InitializeBrowser()
    {
        try
        {
            string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            if (String.IsNullOrWhiteSpace(version)) throw new InvalidOperationException("Runtime missing.");
            Directory.CreateDirectory(profile);
            CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions();
            options.AreBrowserExtensionsEnabled = false;
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, profile, options);
            await browser.EnsureCoreWebView2Async(environment);
            CoreWebView2 core = browser.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = true;
            core.WebMessageReceived += OnWebMessage;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsBuiltInErrorPageEnabled = false;
            core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
            core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e)
            {
                if (!LocalAddress(e.Uri)) { e.Cancel = true; return; }
                ready = navigationCompleted = workspaceReady = webUiReady = false;
                ShowLoading();
                StartStartupWatchdog();
                if (closeRequestId != null)
                {
                    InvalidateClosePrompt(true);
                    if (!shuttingDown) { closePending = false; Emit("close_cancelled", null); }
                }
            };
            core.FrameNavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) { if (!LocalAddress(e.Uri) && e.Uri != "about:blank") e.Cancel = true; };
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) { e.State = CoreWebView2PermissionState.Deny; e.Handled = true; };
            // Include workers/frames as well as document requests. The older
            // overload omits request sources in recent WebView2 versions.
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs e)
            {
                string uri = e.Request.Uri;
                if (!LocalAddress(uri) && !uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && !uri.StartsWith("blob:" + origin.GetLeftPart(UriPartial.Authority) + "/", StringComparison.OrdinalIgnoreCase))
                {
                    CoreWebView2Deferral deferral = e.GetDeferral();
                    try {
                        e.Response = environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("Blocked")), 403, "Blocked", "Content-Type: text/plain\r\n");
                    } catch (Exception) { browser.Stop(); ShowStatus("界面请求已停止，请关闭后重试。 / The display request was stopped. Close and retry."); }
                    finally { deferral.Complete(); }
                }
            };
            core.ProcessFailed += delegate {
                if (!ready) ShowStartupFailure("window");
                else Fail("界面进程意外停止，请关闭并重新启动 MediaSlim X。\nThe display process stopped. Close and restart MediaSlim X.");
            };
            core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs e)
            {
                if (!e.IsSuccess)
                {
                    if (e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                        ShowStartupFailure("navigation");
                    return;
                }
                if (!LocalAddress(core.Source)) return;
                navigationCompleted = true;
                TryPresentWorkspace();
            };
            // Match the server's CSP as an additional host-side boundary. The
            // mutation observer runs as the initial document element is created,
            // before the page's ordinary local scripts are parsed and executed.
            await core.AddScriptToExecuteOnDocumentCreatedAsync(@"(function () {
                var done = false, observer;
                function attach() {
                    var parent = document.head || document.documentElement;
                    if (!parent || done) return;
                    done = true;
                    var meta = document.createElement('meta');
                    meta.httpEquiv = 'Content-Security-Policy';
                    meta.content = ""default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"";
                    parent.insertBefore(meta, parent.firstChild);
                    if (observer) observer.disconnect();
                }
                if (document.documentElement) attach();
                else { observer = new MutationObserver(attach); observer.observe(document, {childList: true, subtree: true}); }
            })();");
            browserInitialized = true;
            core.Navigate(startUrl);
        }
        catch (Exception error)
        {
            ShowStartupFailure(error is UnauthorizedAccessException || error is IOException ? "profile"
                : error is InvalidOperationException && error.Message == "Runtime missing." ? "runtime" : "window",
                true, error.GetType().Name + ": " + error.Message + " (0x" + error.HResult.ToString("X8") + ")");
        }
    }

    private void Fail(string message)
    {
        InvalidateClosePrompt(true);
        webUiReady = false;
        ShowStatus(message);
        Emit("error", new Dictionary<string, object> { { "message", message } });
    }

    private void OnClosing(object sender, FormClosingEventArgs e)
    {
        if (allowClose) return;
        e.Cancel = true;
        if (closePending) { PostPendingClosePrompt(); return; }
        closePending = true;
        Emit("close_requested", null);
    }

    private void HandleCommand(Dictionary<string, object> command)
    {
        string op = RequiredString(command, "op");
        if (op == "confirm_close")
        {
            object busy;
            bool working = command.TryGetValue("busy", out busy) && busy is bool && (bool)busy;
            ConfirmClose(working);
        }
        else if (op == "closing")
        {
            shuttingDown = true;
            InvalidateClosePrompt(true);
            closePending = true;
            ShowStatus(LocalText("正在安全退出，等待文件或恢复操作收尾…", "Exiting safely. Waiting for the current file or restore operation…"));
        }
        else if (op == "close") { InvalidateClosePrompt(true); allowClose = true; Close(); }
        else if (op == "directory_result")
        {
            object identifier, path, error;
            if (command.Count != 3 || !command.TryGetValue("request_id", out identifier) || !(identifier is string)
                || !Regex.IsMatch((string)identifier, "^[a-f0-9]{32}$")
                || !directoryRequests.Remove((string)identifier)) return;
            if (closePending || ownerEnded) return;
            if (command.TryGetValue("path", out path) && path is string && !String.IsNullOrWhiteSpace((string)path)
                && ((string)path).Length <= 4096 && ((string)path).IndexOf('\0') < 0 && Path.IsPathRooted((string)path))
                PostDirectoryResult((string)identifier, (string)path, null);
            else if (command.TryGetValue("error", out error) && error is string && !String.IsNullOrWhiteSpace((string)error)
                && ((string)error).Length <= 4096 && ((string)error).IndexOf('\0') < 0)
                PostDirectoryResult((string)identifier, null, (string)error);
        }
        else if (op == "error") { ShowStatus(RequiredString(command, "message")); closePending = false; }
    }

    private void WatchOwner()
    {
        ownerTimer = new System.Windows.Forms.Timer();
        ownerTimer.Interval = 1500;
        ownerTimer.Tick += delegate
        {
            try { using (Process parent = Process.GetProcessById(parentPid)) { if (!parent.HasExited) return; } }
            catch (ArgumentException) { }
            catch (InvalidOperationException) { }
            OwnerEnded();
        };
        ownerTimer.Start();
    }

    private void OwnerEnded()
    {
        if (ownerEnded) return;
        ownerEnded = true;
        InvalidateClosePrompt(true);
        allowClose = true;
        Close();
    }

    [STAThread]
    private static int Main()
    {
        Output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        try
        {
            SetCurrentProcessExplicitAppUserModelID("MediaSlimX.Window");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            TextReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false, true));
            string line = ReadCommand(input);
            if (line == null) return 1;
            Dictionary<string, object> first = Json.Deserialize<Dictionary<string, object>>(line);
            if (RequiredString(first, "op") != "start") throw new InvalidDataException("Expected startup command.");
            using (MediaSlimWindow window = new MediaSlimWindow(first))
            {
                bool commandReaderStarted = false;
                window.HandleCreated += delegate
                {
                    // WinForms can recreate its handle during DPI or display
                    // changes. The private input pipe must have one reader.
                    if (commandReaderStarted) return;
                    commandReaderStarted = true;
                    window.WatchOwner();
                    Thread reader = new Thread(delegate()
                    {
                        try
                        {
                            for (string commandLine; (commandLine = ReadCommand(input)) != null; )
                            {
                                Dictionary<string, object> command = Json.Deserialize<Dictionary<string, object>>(commandLine);
                                window.Dispatch(delegate { try { window.HandleCommand(command); } catch (Exception) { window.Fail("窗口控制消息无效。 / Invalid window control message."); } });
                            }
                        }
                        catch (Exception) { Emit("error", new Dictionary<string, object> { { "message", "窗口控制连接中断。 / Window control connection was interrupted." } }); }
                        window.Dispatch(window.OwnerEnded);
                    });
                    reader.IsBackground = true;
                    reader.Start();
                };
                Application.Run(window);
            }
            return 0;
        }
        catch (Exception)
        {
            const string message = "MediaSlim X 独立窗口无法启动，请检查安装文件及 .NET Framework 4.8 或更新版本。\nThe app window could not start. Check the extracted files and .NET Framework 4.8 or newer.";
            Emit("error", new Dictionary<string, object> { { "message", message } });
            return 1;
        }
    }
}
