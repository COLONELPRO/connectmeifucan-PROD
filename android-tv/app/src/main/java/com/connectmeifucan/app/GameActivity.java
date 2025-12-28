package com.connectmeifucan.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.view.KeyEvent;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class GameActivity extends AppCompatActivity {
    private WebView webView;
    private TextView roomInfoText;
    private String roomId, username, token;
    private boolean isHost;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_game);
        
        // Get room info from intent
        roomId = getIntent().getStringExtra("roomId");
        username = getIntent().getStringExtra("username");
        isHost = getIntent().getBooleanExtra("isHost", false);
        token = getIntent().getStringExtra("token");
        
        roomInfoText = findViewById(R.id.room_info_text);
        roomInfoText.setText("Room: " + roomId + " | " + (isHost ? "Host" : "Player") + " | " + username);
        
        webView = findViewById(R.id.game_webview);
        setupWebView();
        
        // Load main app with room context
        String url = "https://connectmeifucan.com/index.html?room=" + roomId + "&username=" + username + "&host=" + isHost;
        webView.loadUrl(url);
    }
    
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        
        // Security: Disable file access
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        
        // Security hardening
        settings.setGeolocationEnabled(false);
        settings.setDatabaseEnabled(false);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        
        // Add JavaScript interface for game events
        webView.addJavascriptInterface(new GameInterface(), "AndroidGame");
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Security: Only allow navigation to trusted domains
                if (url.startsWith("https://connectmeifucan.com/") || 
                    url.startsWith("http://localhost:")) {
                    return false; // Allow
                }
                // Block navigation to untrusted domains
                Toast.makeText(GameActivity.this, "External navigation blocked", Toast.LENGTH_SHORT).show();
                return true;
            }
            
            @Override
            public void onPageFinished(WebView view, String url) {
                // Inject room context into page (escape values to prevent XSS)
                String escapedRoomId = roomId.replaceAll("[^A-Z]", "");
                String escapedUsername = username.replaceAll("[^a-zA-Z0-9_-]", "");
                String escapedToken = token.replaceAll("[^a-zA-Z0-9]", "");
                
                String js = String.format(
                    "window.ROOM_ID='%s'; window.USERNAME='%s'; window.IS_HOST=%b; window.TOKEN='%s';",
                    escapedRoomId, escapedUsername, isHost, escapedToken
                );
                webView.evaluateJavascript(js, null);
            }
        });
    }
    
    public class GameInterface {
        @JavascriptInterface
        public void onGameEvent(String event, String data) {
            runOnUiThread(() -> {
                Toast.makeText(GameActivity.this, "Game event: " + event, Toast.LENGTH_SHORT).show();
            });
        }
        
        @JavascriptInterface
        public void leaveRoom() {
            finish();
        }
    }
    
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // Confirm before leaving room
            new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Leave Room")
                .setMessage("Are you sure you want to leave room " + roomId + "?")
                .setPositiveButton("Yes", (dialog, which) -> finish())
                .setNegativeButton("No", null)
                .show();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
