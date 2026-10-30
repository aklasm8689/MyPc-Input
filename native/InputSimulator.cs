using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace MyPcInput
{
    public static class InputSimulator
    {
        public static void ExecuteKeyAction(string action)
        {
            if (string.IsNullOrEmpty(action)) return;
            string keyToSend = "";
            switch (action.ToLowerInvariant())
            {
                case "enter": keyToSend = "{ENTER}"; break;
                case "ctrl_enter": keyToSend = "^{ENTER}"; break;
                case "shift_enter": keyToSend = "+{ENTER}"; break;
                case "backspace": keyToSend = "{BACKSPACE}"; break;
                case "space": keyToSend = " "; break;
                case "tab": keyToSend = "{TAB}"; break;
                case "esc": keyToSend = "{ESC}"; break;
                case "up": keyToSend = "{UP}"; break;
                case "down": keyToSend = "{DOWN}"; break;
                case "left": keyToSend = "{LEFT}"; break;
                case "right": keyToSend = "{RIGHT}"; break;
            }
            if (!string.IsNullOrEmpty(keyToSend))
            {
                SendKeys.SendWait(keyToSend);
            }
        }

        public static void SetClipboardAndPasteSta(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            var t = new Thread(() =>
            {
                try
                {
                    Clipboard.SetText(text);
                    Thread.Sleep(40);
                    SendKeys.SendWait("^v");
                }
                catch { }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(2000);
        }

        public static void SetClipboardImageAndPasteSta(byte[] imgBytes)
        {
            if (imgBytes == null || imgBytes.Length == 0) return;
            var t = new Thread(() =>
            {
                try
                {
                    using (var ms = new MemoryStream(imgBytes))
                    using (var img = Image.FromStream(ms))
                    {
                        Clipboard.SetImage(img);
                        Thread.Sleep(60);
                        SendKeys.SendWait("^v");
                    }
                }
                catch { }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(3000);
        }
    }
}
