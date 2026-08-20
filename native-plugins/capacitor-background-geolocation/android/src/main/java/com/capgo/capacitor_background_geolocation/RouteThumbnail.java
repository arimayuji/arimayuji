package com.capgo.capacitor_background_geolocation;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;

/**
 * Renders the same "x,y x,y ..." polyline strings the web side already
 * produces (points normalized to a 0-100 square — see
 * src/lib/tracking/routeProjection.ts's projectRoute()) as a small bitmap,
 * for the rich tracking notification's route thumbnail. A notification's
 * RemoteViews can only show a bitmap, not draw live vector shapes, so this
 * is the native-side equivalent of what the web UI's RouteStrip component
 * draws with an SVG polyline — same source data, and the same rule that a
 * tracking gap breaks the line rather than drawing straight across it: one
 * Path per polyline entry, never joined across entries.
 *
 * Xanthus fork — not part of the upstream plugin.
 */
final class RouteThumbnail {

    private RouteThumbnail() {}

    /** Returns null if there was nothing drawable (empty/malformed input) — callers should hide the ImageView in that case rather than show a blank bitmap. */
    static Bitmap draw(String[] polylines, int sizePx, int strokeColor) {
        if (polylines == null || polylines.length == 0) return null;

        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(strokeColor);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(2f, sizePx / 20f));
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);

        // projectRoute() on the web side always normalizes to a 0-100 square.
        float scale = sizePx / 100f;
        boolean drewAnything = false;

        for (String polyline : polylines) {
            if (polyline == null || polyline.trim().isEmpty()) continue;
            Path path = new Path();
            boolean first = true;
            for (String pointStr : polyline.trim().split("\\s+")) {
                String[] parts = pointStr.split(",");
                if (parts.length != 2) continue;
                try {
                    float x = Float.parseFloat(parts[0]) * scale;
                    float y = Float.parseFloat(parts[1]) * scale;
                    if (first) {
                        path.moveTo(x, y);
                        first = false;
                    } else {
                        path.lineTo(x, y);
                    }
                } catch (NumberFormatException ignored) {
                    // A malformed point just gets skipped — the rest of the stretch still draws.
                }
            }
            if (!first) {
                canvas.drawPath(path, paint);
                drewAnything = true;
            }
        }

        return drewAnything ? bitmap : null;
    }
}
