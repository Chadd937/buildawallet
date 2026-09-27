package xyz.buildawallet.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Offline native design preview. No Internet permission or wallet authority. */
public final class MainActivity extends Activity {
    private static final int PICK_BLUEPRINT = 7;
    private static final String PREFS = "design_preview";
    private WalletPreviewView phone;
    private TextView summary;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7, 10, 20));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 20));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(7, 10, 20));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(34), dp(20), dp(28));
        scroll.addView(content);

        TextView eyebrow = label("BUILD A WALLET  /  ANDROID STUDIO PREVIEW", 11, 0xff56ebd3, true);
        content.addView(eyebrow);
        TextView heading = label("Your wallet, imagined.", 31, Color.WHITE, true);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
        headingParams.topMargin = dp(10);
        content.addView(heading, headingParams);
        TextView intro = label("Bring in a design JSON from buildawallet.xyz/human/studio and explore your concept on the phone.",
            15, 0xffa6b5c9, false);
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(-1, -2);
        introParams.topMargin = dp(8);
        content.addView(intro, introParams);

        Button choose = new Button(this);
        choose.setAllCaps(false);
        choose.setText("Import Studio blueprint");
        choose.setTextColor(0xff061213);
        choose.setTextSize(16);
        choose.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        choose.setBackground(pill(0xff56ebd3, 0xff56ebd3));
        choose.setOnClickListener(v -> chooseDesign());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(-1, dp(54));
        buttonParams.topMargin = dp(24);
        content.addView(choose, buttonParams);

        summary = label("No blueprint loaded yet", 14, 0xffa6b5c9, false);
        LinearLayout.LayoutParams summaryParams = new LinearLayout.LayoutParams(-1, -2);
        summaryParams.topMargin = dp(15);
        content.addView(summary, summaryParams);

        phone = new WalletPreviewView(this);
        LinearLayout.LayoutParams phoneParams = new LinearLayout.LayoutParams(-1, dp(515));
        phoneParams.topMargin = dp(25);
        content.addView(phone, phoneParams);

        TextView notice = label("DESIGN PREVIEW ONLY  •  No balances, key storage, signing or transactions. Do not send funds to this app.",
            12, 0xffffce80, true);
        notice.setPadding(dp(16), dp(15), dp(16), dp(15));
        notice.setBackground(pill(0xff171923, 0xff705a35));
        LinearLayout.LayoutParams noticeParams = new LinearLayout.LayoutParams(-1, -2);
        noticeParams.topMargin = dp(22);
        content.addView(notice, noticeParams);
        setContentView(scroll);

        String saved = getSharedPreferences(PREFS, MODE_PRIVATE).getString("blueprint", null);
        if (saved != null) {
            try { display(Blueprint.parse(saved)); }
            catch (JSONException ignored) { getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("blueprint").apply(); }
        }
    }

    private void chooseDesign() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, PICK_BLUEPRINT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_BLUEPRINT || resultCode != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IOException("Could not open the selected file.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                if (out.size() + count > 65536) throw new IOException("The design file exceeds 64 KB.");
                out.write(buffer, 0, count);
            }
            String json = out.toString(StandardCharsets.UTF_8.name());
            Blueprint blueprint = Blueprint.parse(json);
            // Persist only the visual choices, never the raw imported document.
            String sanitized = new org.json.JSONObject()
                .put("name", blueprint.name)
                .put("networks", new org.json.JSONArray(blueprint.networks))
                .put("assets", new org.json.JSONArray(blueprint.assets))
                .put("style", blueprint.style)
                .put("accent", blueprint.accent).toString();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("blueprint", sanitized).apply();
            display(blueprint);
        } catch (IOException | JSONException error) {
            new AlertDialog.Builder(this).setTitle("Cannot import blueprint")
                .setMessage(error.getMessage()).setPositiveButton("OK", null).show();
        }
    }

    private void display(Blueprint blueprint) {
        summary.setText(blueprint.name + "  •  " + blueprint.networks.size() + " chains  •  "
            + blueprint.assets.size() + " assets");
        phone.setBlueprint(blueprint);
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

    private GradientDrawable pill(int background, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(17));
        shape.setStroke(dp(1), border);
        return shape;
    }

    private int dp(float pixels) { return (int) (pixels * getResources().getDisplayMetrics().density + 0.5f); }
}
