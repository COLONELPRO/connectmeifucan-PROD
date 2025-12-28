package com.connectmeifucan.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Random;

public class RoomActivity extends AppCompatActivity {
    private static final String API_BASE = "https://api.connectmeifucan.com";
    private EditText roomIdInput;
    private Button createRoomBtn, joinRoomBtn, logoutBtn;
    private TextView welcomeText, statusText;
    private String username, token;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_room);
        
        // Get user credentials
        SharedPreferences prefs = getSharedPreferences("cmuc_prefs", MODE_PRIVATE);
        username = prefs.getString("username", "");
        token = prefs.getString("token", "");
        
        if (username.isEmpty()) {
            // Not authenticated, go back to main
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }
        
        initializeViews();
        setupListeners();
    }
    
    private void initializeViews() {
        welcomeText = findViewById(R.id.welcome_text);
        statusText = findViewById(R.id.status_text);
        roomIdInput = findViewById(R.id.room_id_input);
        createRoomBtn = findViewById(R.id.create_room_btn);
        joinRoomBtn = findViewById(R.id.join_room_btn);
        logoutBtn = findViewById(R.id.logout_btn);
        
        welcomeText.setText("Welcome, " + username);
    }
    
    private void setupListeners() {
        createRoomBtn.setOnClickListener(v -> createRoom());
        joinRoomBtn.setOnClickListener(v -> joinRoom());
        logoutBtn.setOnClickListener(v -> logout());
    }
    
    // Security: Sanitize and validate inputs
    private String sanitizeInput(String input, int maxLength) {
        if (input == null) return "";
        return input.trim()
            .replaceAll("[<>\"'`]", "")
            .replaceAll("(?i)javascript:", "")
            .replaceAll("(?i)on\\w+=", "")
            .replaceAll("\\0", "")
            .substring(0, Math.min(input.length(), maxLength));
    }
    
    private boolean isValidUsername(String username) {
        return username != null && username.matches("^[a-zA-Z0-9_-]{3,20}$");
    }
    
    private boolean isValidRoomId(String roomId) {
        return roomId != null && roomId.matches("^[A-Z]{4}$");
    }
    
    private void createRoom() {
        setLoading(true, "Creating room...");
        
        new Thread(() -> {
            try {
                // Get and sanitize input
                String roomId = sanitizeInput(roomIdInput.getText().toString(), 4).toUpperCase();
                
                // Security: Only allow A-Z
                roomId = roomId.replaceAll("[^A-Z]", "");
                
                if (roomId.isEmpty()) {
                    roomId = generateRoomId();
                }
                
                // Validate format (strict check)
                if (!isValidRoomId(roomId)) {
                    showError("Room ID must be exactly 4 uppercase letters (A-Z)");
                    return;
                }
                
                // Validate username
                String sanitizedUsername = sanitizeInput(username, 20);
                if (!isValidUsername(sanitizedUsername)) {
                    showError("Invalid username format");
                    return;
                }
                
                // API call to create room (use sanitized username)
                JSONObject response = apiCall("POST", "/rooms/create", new JSONObject()
                    .put("roomId", roomId)
                    .put("username", sanitizedUsername)
                    .put("host", true));
                
                if (response.getBoolean("success")) {
                    String createdRoomId = response.getString("roomId");
                    runOnUiThread(() -> {
                        setLoading(false, "");
                        Toast.makeText(this, "Room created: " + createdRoomId, Toast.LENGTH_LONG).show();
                        openGameSession(createdRoomId, true);
                    });
                } else {
                    showError(response.getString("message"));
                }
            } catch (Exception e) {
                showError("Failed to create room: " + e.getMessage());
            }
        }).start();
    }
    
    private void joinRoom() {
        String roomId = sanitizeInput(roomIdInput.getText().toString(), 4).toUpperCase();
        
        // Security: Only allow A-Z
        roomId = roomId.replaceAll("[^A-Z]", "");
        
        if (!isValidRoomId(roomId)) {
            Toast.makeText(this, "Enter a valid 4-letter room code (A-Z)", Toast.LENGTH_SHORT).show();
            return;
        }
        
        String sanitizedUsername = sanitizeInput(username, 20);
        if (!isValidUsername(sanitizedUsername)) {
            Toast.makeText(this, "Invalid username format", Toast.LENGTH_SHORT).show();
            return;
        }
        
        setLoading(true, "Joining room " + roomId + "...");
        
        new Thread(() -> {
            try {
                JSONObject response = apiCall("POST", "/rooms/join", new JSONObject()
                    .put("roomId", roomId)
                    .put("username", sanitizedUsername));
                
                if (response.getBoolean("success")) {
                    runOnUiThread(() -> {
                        setLoading(false, "");
                        Toast.makeText(this, "Joined room: " + roomId, Toast.LENGTH_SHORT).show();
                        openGameSession(roomId, false);
                    });
                } else {
                    showError(response.getString("message"));
                }
            } catch (Exception e) {
                showError("Failed to join room: " + e.getMessage());
            }
        }).start();
    }
    
    private void openGameSession(String roomId, boolean isHost) {
        Intent intent = new Intent(this, GameActivity.class);
        intent.putExtra("roomId", roomId);
        intent.putExtra("username", username);
        intent.putExtra("isHost", isHost);
        intent.putExtra("token", token);
        startActivity(intent);
    }
    
    private void logout() {
        getSharedPreferences("cmuc_prefs", MODE_PRIVATE).edit().clear().apply();
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
    
    private String generateRoomId() {
        Random random = new Random();
        StringBuilder sb = new StringBuilder(4);
        for (int i = 0; i < 4; i++) {
            sb.append((char) ('A' + random.nextInt(26)));
        }
        return sb.toString();
    }
    
    private JSONObject apiCall(String method, String endpoint, JSONObject body) throws Exception {
        URL url = new URL(API_BASE + endpoint);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setDoOutput(true);
        
        // Send request body
        OutputStream os = conn.getOutputStream();
        os.write(body.toString().getBytes("UTF-8"));
        os.close();
        
        // Read response
        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) {
            response.append(line);
        }
        br.close();
        
        return new JSONObject(response.toString());
    }
    
    private void setLoading(boolean loading, String message) {
        runOnUiThread(() -> {
            createRoomBtn.setEnabled(!loading);
            joinRoomBtn.setEnabled(!loading);
            roomIdInput.setEnabled(!loading);
            statusText.setText(message);
            statusText.setVisibility(loading ? View.VISIBLE : View.GONE);
        });
    }
    
    private void showError(String message) {
        runOnUiThread(() -> {
            setLoading(false, "");
            Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        });
    }
}
