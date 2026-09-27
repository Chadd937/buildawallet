package xyz.buildawallet.studio;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

import java.util.List;
import java.util.Locale;

/** Illustrative device mockup, deliberately showing no fabricated funds. */
final class WalletPreviewView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Blueprint blueprint;

    WalletPreviewView(Context context) { super(context); }

    void setBlueprint(Blueprint value) {
        blueprint = value;
        invalidate();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float scale = Math.min(getWidth() / 340f, getHeight() / 510f);
        canvas.save();
        canvas.translate((getWidth() - 340f * scale) / 2f, (getHeight() - 510f * scale) / 2f);
        canvas.scale(scale, scale);

        round(canvas, 12, 3, 328, 507, 42, 0xff334454);
        round(canvas, 16, 7, 324, 503, 39, 0xff0d1424);
        round(canvas, 27, 19, 313, 491, 30, 0xff111c31);
        round(canvas, 132, 18, 208, 32, 8, 0xff050911);

        int accent = accentColor();
        text(canvas, "BUILD A WALLET", 46, 64, 12, accent, true);
        text(canvas, "DESIGN PREVIEW", 197, 64, 10, 0xff8fa7be, true);
        String name = blueprint == null ? "Your wallet" : blueprint.name;
        text(canvas, truncate(name, 21), 46, 111, 23, Color.WHITE, true);
        text(canvas, "A wallet shaped around your choices", 46, 133, 11, 0xff9fb2c7, false);

        paint.setShader(new LinearGradient(42, 157, 291, 280, accent, 0xff6153a6, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(42, 157, 298, 277), 21, 21, paint);
        paint.setShader(null);
        text(canvas, "YOUR CONCEPT", 59, 181, 11, 0xff071321, true);
        text(canvas, "No funds in this preview", 59, 215, 18, 0xff061322, true);
        text(canvas, blueprint == null ? "Import a blueprint to personalize" :
            blueprint.networks.size() + " selected chains", 59, 249, 12, 0xff102237, true);

        text(canvas, "NETWORKS", 45, 315, 12, 0xff9fb2c7, true);
        chips(canvas, blueprint == null ? null : blueprint.networks, 337, accent, "Base", "Solana");
        text(canvas, "ASSETS", 45, 406, 12, 0xff9fb2c7, true);
        chips(canvas, blueprint == null ? null : blueprint.assets, 428, 0xffb5a2ff, "USDC", "SOL");
        text(canvas, "Preview only  •  no keys or transactions", 46, 478, 10, 0xff879db4, false);
        canvas.restore();
    }

    private void chips(Canvas canvas, List<String> values, float y, int color,
                       String fallbackOne, String fallbackTwo) {
        String first = values == null || values.isEmpty() ? fallbackOne : label(values.get(0));
        String second = values == null || values.size() < 2 ? fallbackTwo : label(values.get(1));
        round(canvas, 44, y, 158, y + 45, 14, 0xff203048);
        round(canvas, 168, y, 296, y + 45, 14, 0xff203048);
        circle(canvas, 62, y + 22, 8, color);
        circle(canvas, 186, y + 22, 8, 0xff56e5da);
        text(canvas, truncate(first, 11), 77, y + 28, 13, Color.WHITE, true);
        text(canvas, truncate(second, 11), 201, y + 28, 13, Color.WHITE, true);
    }

    private int accentColor() {
        if (blueprint == null) return 0xff56ebd3;
        switch (blueprint.accent) {
            case "a_purple": return 0xffb79aff;
            case "a_blue": return 0xff80b6ff;
            case "a_pink": return 0xffff91c8;
            case "a_gold": return 0xffffdb75;
            default: return 0xff56ebd3;
        }
    }

    private String label(String id) {
        if (id.startsWith("n_")) id = id.substring(2);
        return id.replace('_', ' ').toUpperCase(Locale.US);
    }

    private String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max - 1) + "…" : value;
    }

    private void round(Canvas canvas, float left, float top, float right, float bottom, float radius, int color) {
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        canvas.drawRoundRect(new RectF(left, top, right, bottom), radius, radius, paint);
    }

    private void circle(Canvas canvas, float x, float y, float radius, int color) {
        paint.setColor(color);
        canvas.drawCircle(x, y, radius, paint);
    }

    private void text(Canvas canvas, String value, float x, float y, float size, int color, boolean bold) {
        paint.setColor(color);
        paint.setTextSize(size);
        paint.setTypeface(bold ? android.graphics.Typeface.DEFAULT_BOLD : android.graphics.Typeface.DEFAULT);
        canvas.drawText(value, x, y, paint);
    }
}
