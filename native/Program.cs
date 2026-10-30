using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MyPcInput
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // 1. Resolve embedded QRCoder.dll from inside MyPc-Input.exe
            AppDomain.CurrentDomain.AssemblyResolve += (sender, resolveArgs) =>
            {
                try
                {
                    string asmName = new AssemblyName(resolveArgs.Name).Name;
                    if (asmName.Equals("QRCoder", StringComparison.OrdinalIgnoreCase))
                    {
                        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("QRCoder.dll"))
                        {
                            if (stream != null)
                            {
                                byte[] buffer = new byte[stream.Length];
                                stream.Read(buffer, 0, buffer.Length);
                                return Assembly.Load(buffer);
                            }
                        }
                    }
                }
                catch { }
                return null;
            };

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 2. Single-Instance Check
            bool createdNew;
            using (var mutex = new Mutex(true, "Global\\MyPcInput_SingleInstance_Mutex", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("MyPc-Input is already running! Check your system tray near the clock.", "MyPc-Input", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                bool startHidden = false;
                if (args != null)
                {
                    foreach (var arg in args)
                    {
                        if (arg.Equals("--background", StringComparison.OrdinalIgnoreCase) ||
                            arg.Equals("-background", StringComparison.OrdinalIgnoreCase) ||
                            arg.Equals("/background", StringComparison.OrdinalIgnoreCase))
                        {
                            startHidden = true;
                            break;
                        }
                    }
                }

                // 3. Run with MyAppContext
                Application.Run(new MyAppContext(startHidden));
            }
        }

        public static string GetLanIp()
        {
            try
            {
                using (var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("8.8.8.8", 65530);
                    var ep = socket.LocalEndPoint as IPEndPoint;
                    if (ep != null) return ep.Address.ToString();
                }
            }
            catch { }

            foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
                    ni.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                {
                    foreach (var ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            return ip.Address.ToString();
                        }
                    }
                }
            }
            return "127.0.0.1";
        }

        public static bool IsAutoStartEnabled()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    return key != null && key.GetValue("MyPc-Input") != null;
                }
            }
            catch { return false; }
        }

        public static void SetAutoStart(bool enable)
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            key.SetValue("MyPc-Input", "\"" + Application.ExecutablePath + "\" --background");
                        }
                        else
                        {
                            key.DeleteValue("MyPc-Input", false);
                        }
                    }
                }
            }
            catch { }
        }
    }

    public class MyAppContext : ApplicationContext
    {
        private MainForm _form;

        public MyAppContext(bool startHidden)
        {
            _form = new MainForm(this);
            if (!startHidden)
            {
                _form.Show();
            }
        }
    }
}
