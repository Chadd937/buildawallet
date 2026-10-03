package xyz.buildawallet.studio;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class LegalGateActivity extends Activity {
    private static final String PREFS = "buildawallet_legal";
    private static final String KEY_VERSION = "accepted_policy_version";
    private static final String LEGAL_VERSION = "2026-10-03-v1";

    private static final int BG = 0xff070a14;
    private static final int CARD = 0xff121827;
    private static final int TEXT = 0xfff5f7fb;
    private static final int MUTED = 0xff9aabc3;
    private static final int ACCENT = 0xff56ebd3;
    private static final int WARNING = 0xffffd38a;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        if (hasAcceptedCurrentVersion()) {
            openWallet();
            return;
        }

        renderGate();
    }

    private boolean hasAcceptedCurrentVersion() {
        return LEGAL_VERSION.equals(
            getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VERSION, null));
    }

    private void renderGate() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(28), dp(20), dp(36));
        scroll.addView(content);
        setContentView(scroll);

        content.addView(label("BUILDAWALLET  /  BEFORE YOU CONTINUE", 11, ACCENT, true));
        add(content, label("Terms & privacy", 36, TEXT, true), 10);
        add(content, label(
            "BuildAWallet is self-custody software. Review the Terms of Service and Privacy Policy before creating, restoring or using a wallet.",
            15, MUTED, false), 12);

        LinearLayout privacyCard = card();
        privacyCard.addView(label("Privacy baseline", 18, TEXT, true));
        addTo(privacyCard, label(
            "BuildAWallet does not sell personal information or share it for cross-context behavioral advertising. Recovery phrases and private keys stay on your device and must never be sent to BuildAWallet.",
            13, MUTED, false), 8);
        add(content, privacyCard, 22);

        Button terms = button("Read Terms of Service", false);
        terms.setOnClickListener(v -> openUrl("https://buildawallet.xyz/terms"));
        add(content, terms, 14);

        Button privacy = button("Read Privacy Policy", false);
        privacy.setOnClickListener(v -> openUrl("https://buildawallet.xyz/privacy"));
        add(content, privacy, 10);

        Button choices = button("Your Privacy Choices", false);
        choices.setOnClickListener(v -> openUrl("https://buildawallet.xyz/privacy-choices"));
        add(content, choices, 10);

        TextView risk = label(
            "Self-custody means you are responsible for your recovery phrase, addresses, networks and transaction approvals. Blockchain transactions can be irreversible.",
            12, WARNING, true);
        risk.setPadding(dp(16), dp(15), dp(16), dp(15));
        risk.setBackground(pill(CARD, 0xff6a5834));
        add(content, risk, 20);

        CheckBox agree = new CheckBox(this);
        agree.setText("I am at least 18 years old (or the age of legal majority where I live), I have read and agree to the Terms of Service, and I acknowledge the Privacy Policy.");
        agree.setTextColor(TEXT);
        agree.setTextSize(14);
        agree.setPadding(dp(10), dp(12), dp(10), dp(12));
        agree.setBackground(pill(CARD, 0xff31405a));
        add(content, agree, 18);

        TextView rights = label(
            "This acknowledgment does not waive any privacy or consumer right that applicable law says cannot be waived.",
            12, MUTED, false);
        add(content, rights, 10);

        Button enter = button("I agree · Continue", true);
        enter.setEnabled(false);
        enter.setAlpha(0.5f);
        agree.setOnCheckedChangeListener((buttonView, checked) -> {
            enter.setEnabled(checked);
            enter.setAlpha(checked ? 1f : 0.5f);
        });
        enter.setOnClickListener(v -> {
            if (!agree.isChecked()) return;
            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_VERSION, LEGAL_VERSION)
                .apply();
            openWallet();
        });
        add(content, enter, 20);

        Button decline = button("I do not agree · Exit", false);
        decline.setOnClickListener(v -> finishAndRemoveTask());
        add(content, decline, 10);
    }

    private void openWallet() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // The legal summary remains visible even if no browser is available.
        }
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(pill(CARD, 0xff26324a));
        return card;
    }

    private Button button(String text, boolean primary) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? 0xff061213 : TEXT);
        button.setBackground(pill(primary ? ACCENT : CARD, primary ? ACCENT : 0xff31405a));
        return button;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(dp(3), 1f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void add(LinearLayout parent, View view, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMargin);
        parent.addView(view, params);
    }

    private void addTo(LinearLayout parent, View view, int topMargin) {
        add(parent, view, topMargin);
    }

    private GradientDrawable pill(int background, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(17));
        shape.setStroke(dp(1), border);
        return shape;
    }

    private int dp(float pixels) {
        return (int) (pixels * getResources().getDisplayMetrics().density + 0.5f);
    }
}
