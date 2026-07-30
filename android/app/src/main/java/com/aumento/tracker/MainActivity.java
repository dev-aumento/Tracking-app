package com.aumento.tracker;

import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    try {
      CookieManager cookieManager = CookieManager.getInstance();
      cookieManager.setAcceptCookie(true);
      WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
      if (webView != null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          cookieManager.setAcceptThirdPartyCookies(webView, true);
        }
        // Allow long-press text selection / copy in comments.
        webView.setLongClickable(true);
        webView.setOnLongClickListener(v -> false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
      }
    } catch (Exception ignored) {
      // Cookie / selection setup is best-effort.
    }
  }

  @Override
  public void onPause() {
    flushCookies();
    super.onPause();
  }

  @Override
  public void onStop() {
    flushCookies();
    super.onStop();
  }

  private void flushCookies() {
    try {
      CookieManager.getInstance().flush();
    } catch (Exception ignored) {
      // Best-effort persistence before process death.
    }
  }
}
