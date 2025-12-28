package com.connectmeifucan.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private static final String BASE_URL = "https://connectmeifucan.com/index.com.html";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        webView = findViewById(R.id.webview);
        setupWebView();
        
        // Check if user is authenticated
        String username = getSharedPreferences("cmuc_prefs", MODE_PRIVATE)
            .getString("username", null);
        
        if (username != null) {
            // User authenticated, go to room selection
            startActivity(new Intent(this, RoomActivity.class));
            finish();
        } else {
            // Load auth page
            webView.loadUrl(BASE_URL);
        }
    }
    
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        
        // Security: Disable file access to prevent local file reading
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // Security: Disable geolocation and other sensitive APIs
        settings.setGeolocationEnabled(false);
        settings.setDatabaseEnabled(false);
        
        // Security: Enable safe browsing
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        
        // Add JavaScript interface for auth callback
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidApp");
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Intercept redirect to index.html after auth
                if (url.contains("index.html")) {
                    // Auth successful, go to room selection
                    startActivity(new Intent(MainActivity.this, RoomActivity.class));
                    finish();
                    return true;
                }
                return false;
            }
        });
    }
    
    // JavaScript interface for communication with web page
    public class WebAppInterface {
        @JavascriptInterface
        public void onAuthSuccess(String username, String token) {
            // Save credentials
            getSharedPreferences("cmuc_prefs", MODE_PRIVATE)
                .edit()
                .putString("username", username)
                .putString("token", token)
                .apply();
            
            // Navigate to room selection
            runOnUiThread(() -> {
                startActivity(new Intent(MainActivity.this, RoomActivity.class));
                finish();
            });
        }
    }
    
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Handle back button
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
