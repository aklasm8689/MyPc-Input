# My Input — Windows Phase 1

Run `Install_MyInput_Windows.bat` (or `python my_input.py`) and choose **Install & Enable Auto-Start**.

Open `http://YOUR-PC-NAME:5000` on an Android phone connected to the same network—for example, `http://aklas-win:5000`. This uses the same short local hostname endpoint pattern as the user's other local projects, so a changing Wi-Fi IP does not need to be remembered. If the local network does not resolve short hostnames, use the displayed IP URL as a fallback. In Chrome, use the browser menu → **Add to Home screen** to create an app-like shortcut. The page supports Bangla, Unicode, emoji, and voice typing.

The phone page must call a small local endpoint on the same PC server to send text; there is no cloud service or external API. All text stays on the local network.

If the phone cannot connect, allow **My Input** through Windows Firewall on a Private network. The installer attempts to add that rule but Windows may require an elevated prompt.

Use `python my_input.py --serve` for a visible manual server, or `python my_input.py --install` for a non-GUI install.
