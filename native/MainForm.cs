using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace MyPcInput
{
    public class MainForm : Form
    {
        private HttpServer _server;
        private NotifyIcon _trayIcon;
        private ContextMenu _trayMenu;
        private PictureBox _qrBox;
        private Label _lblStatusBadge;
        private Label _lblLanUrl;
        private Button _btnToggleServer;
        private Button _btnCopy;
        private Button _btnOpenBrowser;
        private CheckBox _chkAutoStart;
        private Panel _qrCardPanel;
        private Panel _stoppedCardPanel;
        private System.Windows.Forms.Timer _statusTimer;
        private string _lanUrl = "";
        private MyAppContext _appContext;

        public MainForm(MyAppContext appContext = null)
        {
            _appContext = appContext;
            InitializeUi();

            _server = new HttpServer(5000);
            try
            {
                _server.Start();
            }
            catch { }

            UpdateUiState();

            _statusTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            _statusTimer.Tick += (s, e) => UpdateUiState();
            _statusTimer.Start();
        }

        private void InitializeUi()
        {
            this.Text = "MyPc-Input Control Center";
            this.Size = new Size(420, 600);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(2, 6, 23); // #020617
            this.ForeColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            string appIcoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
            try
            {
                if (File.Exists(appIcoPath)) this.Icon = new Icon(appIcoPath);
            }
            catch { }

            // 1. Top Header
            var pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 60,
                BackColor = Color.FromArgb(2, 6, 23),
                Padding = new Padding(16, 12, 16, 12)
            };

            var lblTitle = new Label
            {
                Text = "MyPc-Input",
                Font = new Font("Segoe UI", 12F, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(16, 10),
                AutoSize = true
            };

            var lblSub = new Label
            {
                Text = "Desktop Control Center",
                Font = new Font("Segoe UI", 8F),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(17, 32),
                AutoSize = true
            };

            _lblStatusBadge = new Label
            {
                Text = "Online (Port 5000)",
                Font = new Font("Segoe UI", 8F, FontStyle.Bold),
                ForeColor = Color.FromArgb(52, 211, 153), // Emerald
                BackColor = Color.FromArgb(16, 185, 129, 35),
                Location = new Point(270, 16),
                Size = new Size(120, 26),
                TextAlign = ContentAlignment.MiddleCenter
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSub);
            pnlHeader.Controls.Add(_lblStatusBadge);

            // 2. Center QR Card
            _qrCardPanel = new Panel
            {
                Location = new Point(20, 75),
                Size = new Size(365, 330),
                BackColor = Color.FromArgb(15, 23, 42), // #0f172a
                Padding = new Padding(16)
            };

            _qrBox = new PictureBox
            {
                Location = new Point(92, 16),
                Size = new Size(180, 180),
                BackColor = Color.White,
                SizeMode = PictureBoxSizeMode.Zoom
            };

            var lblScanHint = new Label
            {
                Text = "Scan with phone camera or enter URL in mobile browser:",
                Font = new Font("Segoe UI", 8F),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(10, 208),
                Size = new Size(345, 30),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var pnlUrl = new Panel
            {
                Location = new Point(16, 245),
                Size = new Size(333, 38),
                BackColor = Color.FromArgb(2, 6, 23),
            };

            _lblLanUrl = new Label
            {
                Text = "http://127.0.0.1:5000",
                Font = new Font("Consolas", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(96, 165, 250),
                Location = new Point(10, 10),
                Size = new Size(235, 20),
                TextAlign = ContentAlignment.MiddleLeft
            };

            _btnCopy = new Button
            {
                Text = "Copy",
                Font = new Font("Segoe UI", 8F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(30, 41, 59),
                FlatStyle = FlatStyle.Flat,
                Location = new Point(255, 5),
                Size = new Size(70, 28),
                Cursor = Cursors.Hand
            };
            _btnCopy.FlatAppearance.BorderSize = 0;
            _btnCopy.Click += (s, e) =>
            {
                try
                {
                    Clipboard.SetText(_lanUrl);
                    _btnCopy.Text = "Copied!";
                    _btnCopy.BackColor = Color.FromArgb(16, 185, 129);
                    var tmr = new System.Windows.Forms.Timer { Interval = 2000 };
                    tmr.Tick += (ts, te) =>
                    {
                        _btnCopy.Text = "Copy";
                        _btnCopy.BackColor = Color.FromArgb(30, 41, 59);
                        tmr.Stop();
                    };
                    tmr.Start();
                }
                catch { }
            };

            pnlUrl.Controls.Add(_lblLanUrl);
            pnlUrl.Controls.Add(_btnCopy);

            _qrCardPanel.Controls.Add(_qrBox);
            _qrCardPanel.Controls.Add(lblScanHint);
            _qrCardPanel.Controls.Add(pnlUrl);

            // 3. Stopped Placeholder Panel
            _stoppedCardPanel = new Panel
            {
                Location = new Point(20, 75),
                Size = new Size(365, 330),
                BackColor = Color.FromArgb(15, 23, 42),
                Visible = false
            };
            var lblStopped = new Label
            {
                Text = "🛑\n\nServer is Stopped\n\nClick 'Start Server' below to resume wireless phone connection.",
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                ForeColor = Color.FromArgb(148, 163, 184),
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter
            };
            _stoppedCardPanel.Controls.Add(lblStopped);

            // 4. Bottom Settings Card
            var pnlSettings = new Panel
            {
                Location = new Point(20, 420),
                Size = new Size(365, 45),
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(12)
            };

            _chkAutoStart = new CheckBox
            {
                Text = "Start automatically with Windows",
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(226, 232, 240),
                Location = new Point(14, 12),
                AutoSize = true,
                Checked = Program.IsAutoStartEnabled(),
                Cursor = Cursors.Hand
            };
            _chkAutoStart.CheckedChanged += (s, e) => Program.SetAutoStart(_chkAutoStart.Checked);
            pnlSettings.Controls.Add(_chkAutoStart);

            // 5. Action Buttons
            _btnToggleServer = new Button
            {
                Text = "Stop Server",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(220, 38, 38), // Red
                FlatStyle = FlatStyle.Flat,
                Location = new Point(20, 480),
                Size = new Size(175, 40),
                Cursor = Cursors.Hand
            };
            _btnToggleServer.FlatAppearance.BorderSize = 0;
            _btnToggleServer.Click += (s, e) =>
            {
                if (_server.IsRunning) _server.Stop();
                else { try { _server.Start(); } catch { } }
                UpdateUiState();
            };

            _btnOpenBrowser = new Button
            {
                Text = "Open in Browser",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(30, 41, 59),
                FlatStyle = FlatStyle.Flat,
                Location = new Point(210, 480),
                Size = new Size(175, 40),
                Cursor = Cursors.Hand
            };
            _btnOpenBrowser.FlatAppearance.BorderSize = 0;
            _btnOpenBrowser.Click += (s, e) =>
            {
                try { System.Diagnostics.Process.Start(_lanUrl); } catch { }
            };

            var lblQuit = new Label
            {
                Text = "Quit Application",
                Font = new Font("Segoe UI", 8F, FontStyle.Underline),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(20, 528),
                Size = new Size(365, 20),
                TextAlign = ContentAlignment.MiddleCenter,
                Cursor = Cursors.Hand
            };
            lblQuit.Click += (s, e) =>
            {
                _trayIcon.Visible = false;
                _server.Stop();
                Application.Exit();
            };

            this.Controls.Add(pnlHeader);
            this.Controls.Add(_qrCardPanel);
            this.Controls.Add(_stoppedCardPanel);
            this.Controls.Add(pnlSettings);
            this.Controls.Add(_btnToggleServer);
            this.Controls.Add(_btnOpenBrowser);
            this.Controls.Add(lblQuit);

            // 6. System Tray Integration
            _trayMenu = new ContextMenu();
            _trayMenu.MenuItems.Add("Open Control Center", (s, e) => RestoreFromTray());
            _trayMenu.MenuItems.Add("Open Web App in Browser", (s, e) => { try { System.Diagnostics.Process.Start(_lanUrl); } catch { } });
            _trayMenu.MenuItems.Add("-");
            _trayMenu.MenuItems.Add("Quit", (s, e) => { _trayIcon.Visible = false; _server.Stop(); Application.Exit(); });

            _trayIcon = new NotifyIcon
            {
                Text = "MyPc-Input",
                ContextMenu = _trayMenu,
                Visible = true
            };
            try
            {
                if (File.Exists(appIcoPath)) _trayIcon.Icon = new Icon(appIcoPath);
                else _trayIcon.Icon = this.Icon;
            }
            catch { }
            _trayIcon.DoubleClick += (s, e) => RestoreFromTray();

            this.FormClosing += (s, e) =>
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    this.Hide();
                    _trayIcon.ShowBalloonTip(2000, "MyPc-Input", "Still running in background. Click tray icon to open.", ToolTipIcon.Info);
                }
            };
        }

        private void RestoreFromTray()
        {
            this.ShowInTaskbar = true;
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void UpdateUiState()
        {
            string ip = Program.GetLanIp();
            _lanUrl = string.Format("http://{0}:{1}", ip, _server.Port);
            _lblLanUrl.Text = _lanUrl;

            if (_server.IsRunning)
            {
                _lblStatusBadge.Text = "Online (Port 5000)";
                _lblStatusBadge.ForeColor = Color.FromArgb(52, 211, 153);
                _lblStatusBadge.BackColor = Color.FromArgb(16, 185, 129, 35);

                _btnToggleServer.Text = "Stop Server";
                _btnToggleServer.BackColor = Color.FromArgb(220, 38, 38);

                _qrCardPanel.Visible = true;
                _stoppedCardPanel.Visible = false;

                LoadQrImage(_lanUrl);
            }
            else
            {
                _lblStatusBadge.Text = "Offline";
                _lblStatusBadge.ForeColor = Color.FromArgb(248, 113, 113);
                _lblStatusBadge.BackColor = Color.FromArgb(239, 68, 68, 35);

                _btnToggleServer.Text = "Start Server";
                _btnToggleServer.BackColor = Color.FromArgb(37, 99, 235);

                _qrCardPanel.Visible = false;
                _stoppedCardPanel.Visible = true;
            }
        }

        private string _lastQrUrl = "";
        private void LoadQrImage(string url)
        {
            if (_lastQrUrl == url) return;
            _lastQrUrl = url;

            // 100% OFFLINE Pure C# QR Code Generation!
            try
            {
                var oldImg = _qrBox.Image;
                _qrBox.Image = QrHelper.GenerateQrBitmap(url, 5);
                if (oldImg != null) oldImg.Dispose();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error generating QR: " + ex.Message);
            }
        }
    }
}
