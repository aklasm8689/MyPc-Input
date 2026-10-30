using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace MyPcInput
{
    public class ClipItem
    {
        public string Id { get; set; }
        public string Text { get; set; }
        public string Time { get; set; }
    }

    public static class ClipboardManager
    {
        private static readonly List<ClipItem> _clipboardHistory = new List<ClipItem>();
        private static string _lastClipboardText = "";

        public static string GetCurrentTextSta()
        {
            string text = "";
            var t = new Thread(() =>
            {
                try
                {
                    if (Clipboard.ContainsText()) text = Clipboard.GetText();
                }
                catch { }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(2000);
            return text;
        }

        public static string GetHistoryJson()
        {
            lock (_clipboardHistory)
            {
                string curClip = GetCurrentTextSta();
                if (!string.IsNullOrEmpty(curClip) && curClip != _lastClipboardText)
                {
                    _lastClipboardText = curClip;
                    _clipboardHistory.Insert(0, new ClipItem
                    {
                        Id = DateTime.UtcNow.Ticks.ToString(),
                        Text = curClip,
                        Time = DateTime.Now.ToString("hh:mm tt")
                    });
                    if (_clipboardHistory.Count > 30) _clipboardHistory.RemoveAt(_clipboardHistory.Count - 1);
                }

                var sb = new StringBuilder("{\"items\":[");
                for (int i = 0; i < _clipboardHistory.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    sb.AppendFormat("{{\"id\":\"{0}\",\"text\":\"{1}\",\"time\":\"{2}\"}}",
                        EscapeJson(_clipboardHistory[i].Id),
                        EscapeJson(_clipboardHistory[i].Text),
                        EscapeJson(_clipboardHistory[i].Time));
                }
                sb.Append("]}");
                return sb.ToString();
            }
        }

        public static void Clear()
        {
            lock (_clipboardHistory)
            {
                _clipboardHistory.Clear();
                _lastClipboardText = GetCurrentTextSta();
            }
        }

        public static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
