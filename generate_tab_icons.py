import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_tab_icon(tab_type, size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 512.0
    r = int(108 * scale)
    pad = int(12 * scale)

    # Theme colors
    if tab_type == 'order':
        bg_top = (26, 21, 14, 255)
        bg_bot = (12, 14, 24, 255)
        border_col = (234, 88, 12, 180)
        accent_1 = (245, 158, 11)   # Amber
        accent_2 = (234, 88, 12)   # Orange
        badge_bg = (234, 88, 12)
        pill_bg = (245, 158, 11, 45)
        pill_border = (245, 158, 11, 140)
        pill_text = "ORDER"
        accent_light = (254, 243, 199)
    elif tab_type == 'history':
        bg_top = (10, 28, 22, 255)
        bg_bot = (10, 15, 24, 255)
        border_col = (16, 185, 129, 180)
        accent_1 = (16, 185, 129)  # Emerald
        accent_2 = (6, 182, 212)   # Cyan
        badge_bg = (16, 185, 129)
        pill_bg = (16, 185, 129, 45)
        pill_border = (16, 185, 129, 140)
        pill_text = "HISTORY"
        accent_light = (209, 250, 229)
    elif tab_type == 'daily':
        bg_top = (24, 18, 48, 255)
        bg_bot = (10, 14, 26, 255)
        border_col = (139, 92, 246, 180)
        accent_1 = (129, 140, 248) # Indigo
        accent_2 = (147, 51, 234)  # Purple
        badge_bg = (245, 158, 11)  # Golden Moon
        pill_bg = (139, 92, 246, 45)
        pill_border = (139, 92, 246, 140)
        pill_text = "LAPORAN"
        accent_light = (237, 233, 254)
    elif tab_type == 'balance':
        bg_top = (15, 23, 42, 255)  # Fintech dark slate
        bg_bot = (2, 6, 23, 255)
        border_col = (56, 189, 248, 180) # Cyan blue
        accent_1 = (56, 189, 248)
        accent_2 = (14, 165, 233)
        badge_bg = (16, 185, 129)
        pill_bg = (6, 182, 212, 50)
        pill_border = (56, 189, 248, 140)
        pill_text = "SALDO"
        accent_light = (224, 242, 254)
    elif tab_type == 'produk':
        bg_top = (30, 27, 75, 255)  # Modern retail indigo
        bg_bot = (11, 15, 25, 255)
        border_col = (99, 102, 241, 180)
        accent_1 = (99, 102, 241)
        accent_2 = (79, 70, 229)
        badge_bg = (16, 185, 129)
        pill_bg = (99, 102, 241, 50)
        pill_border = (129, 140, 248, 140)
        pill_text = "PRODUK"
        accent_light = (238, 242, 255)
    else: # margin
        bg_top = (15, 43, 29, 255)
        bg_bot = (15, 17, 23, 255)
        border_col = (16, 185, 129, 180)
        accent_1 = (16, 185, 129)
        accent_2 = (5, 150, 105)
        badge_bg = (5, 150, 105)
        pill_bg = (16, 185, 129, 45)
        pill_border = (16, 185, 129, 140)
        pill_text = "MARGIN"
        accent_light = (209, 250, 229)

    # 1. Background Rounded Rect with gradient approximation
    for y in range(pad, size - pad):
        factor = (y - pad) / float(size - 2 * pad)
        cr = int(bg_top[0] * (1 - factor) + bg_bot[0] * factor)
        cg = int(bg_top[1] * (1 - factor) + bg_bot[1] * factor)
        cb = int(bg_top[2] * (1 - factor) + bg_bot[2] * factor)
        draw.line([(pad, y), (size - pad, y)], fill=(cr, cg, cb, 255))

    # Mask to rounded rect
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=255)
    img.putalpha(mask)

    # Re-draw on RGBA to have clean border
    final_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final_img.paste(img, (0, 0))
    draw = ImageDraw.Draw(final_img)

    # Border
    bw = max(2, int(6 * scale))
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, outline=border_col, width=bw)

    # 2. Draw Tab-Specific Central Artwork
    if tab_type == 'order':
        cx = int(256 * scale)
        cy = int(220 * scale)
        box_w = int(140 * scale)
        box_h = int(90 * scale)
        p1 = (cx, cy - box_h)
        p2 = (cx + box_w, cy - int(box_h * 0.35))
        p3 = (cx, cy + int(box_h * 0.3))
        p4 = (cx - box_w, cy - int(box_h * 0.35))
        draw.polygon([p1, p2, p3, p4], fill=(245, 158, 11, 255), outline=(254, 243, 199, 255))
        p5 = (cx - box_w, cy + int(box_h * 0.9))
        p6 = (cx, cy + int(box_h * 1.55))
        draw.polygon([p4, p3, p6, p5], fill=(217, 119, 6, 255), outline=(180, 83, 9, 255))
        p7 = (cx + box_w, cy + int(box_h * 0.9))
        draw.polygon([p3, p2, p7, p6], fill=(180, 83, 9, 255), outline=(146, 64, 14, 255))
        t_w = int(24 * scale)
        draw.polygon([(cx - t_w, cy - int(box_h * 0.85)), 
                      (cx + t_w, cy - int(box_h * 0.45)), 
                      (cx + t_w, cy + int(box_h * 0.2)), 
                      (cx - t_w, cy - int(box_h * 0.2))], fill=(254, 215, 170, 240))
        # Restock arrow / badge
        bx = int(375 * scale)
        by = int(140 * scale)
        br = int(46 * scale)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(234, 88, 12, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        aw = int(16 * scale)
        ah = int(22 * scale)
        draw.polygon([(bx, by - ah), (bx + aw, by - int(ah*0.1)), (bx + int(aw*0.45), by - int(ah*0.1)), 
                      (bx + int(aw*0.45), by + ah), (bx - int(aw*0.45), by + ah), 
                      (bx - int(aw*0.45), by - int(ah*0.1)), (bx - aw, by - int(ah*0.1))], fill=(255, 255, 255, 255))

    elif tab_type == 'history':
        base_y = int(320 * scale)
        bw = int(50 * scale)
        spacing = int(22 * scale)
        start_x = int(140 * scale)
        h1 = int(95 * scale)
        draw.rounded_rectangle([start_x, base_y - h1, start_x + bw, base_y], radius=int(10*scale), fill=(5, 150, 105, 255), outline=(110, 231, 183, 200), width=max(1, int(3*scale)))
        x2 = start_x + bw + spacing
        h2 = int(155 * scale)
        draw.rounded_rectangle([x2, base_y - h2, x2 + bw, base_y], radius=int(10*scale), fill=(16, 185, 129, 255), outline=(167, 243, 208, 220), width=max(1, int(3*scale)))
        x3 = x2 + bw + spacing
        h3 = int(215 * scale)
        draw.rounded_rectangle([x3, base_y - h3, x3 + bw, base_y], radius=int(10*scale), fill=(6, 182, 212, 255), outline=(165, 243, 252, 240), width=max(1, int(3*scale)))
        draw.line([(int(115*scale), base_y + int(4*scale)), (int(395*scale), base_y + int(4*scale))], fill=(52, 211, 153, 255), width=max(2, int(6*scale)))
        bx = int(375 * scale)
        by = int(135 * scale)
        br = int(46 * scale)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        pts = [(bx - int(18*scale), by), (bx - int(4*scale), by + int(14*scale)), (bx + int(18*scale), by - int(14*scale))]
        draw.line(pts, fill=(255, 255, 255, 255), width=max(2, int(8*scale)), joint="curve")

    elif tab_type == 'daily':
        doc_x = int(155 * scale)
        doc_y = int(115 * scale)
        doc_w = int(200 * scale)
        doc_h = int(220 * scale)
        draw.rounded_rectangle([doc_x, doc_y, doc_x + doc_w, doc_y + doc_h], radius=int(16*scale), fill=(30, 27, 75, 255), outline=(167, 139, 250, 220), width=max(2, int(5*scale)))
        lw = int(130 * scale)
        line_x = doc_x + int(35 * scale)
        line_spacing = int(32 * scale)
        for i in range(4):
            ly = doc_y + int(55 * scale) + (i * line_spacing)
            cur_w = lw if i != 3 else int(lw * 0.6)
            col = (196, 181, 253, 230) if i == 0 else (139, 92, 246, 180)
            draw.line([(line_x, ly), (line_x + cur_w, ly)], fill=col, width=max(2, int(7*scale)))
        bx = int(375 * scale)
        by = int(135 * scale)
        br = int(48 * scale)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(79, 70, 229, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        m_r = int(28 * scale)
        m_cx = bx - int(4 * scale)
        m_cy = by
        draw.ellipse([m_cx - m_r, m_cy - m_r, m_cx + m_r, m_cy + m_r], fill=(251, 191, 36, 255))
        cut_r = int(25 * scale)
        draw.ellipse([m_cx + int(10*scale) - cut_r, m_cy - int(8*scale) - cut_r, 
                      m_cx + int(10*scale) + cut_r, m_cy - int(8*scale) + cut_r], fill=(79, 70, 229, 255))

    elif tab_type == 'balance':
        # Wallet / Credit Card
        card_x = int(100 * scale)
        card_y = int(140 * scale)
        card_w = int(310 * scale)
        card_h = int(195 * scale)
        # Back tilt card
        back_card = [card_x + int(10*scale), card_y - int(15*scale), card_x + card_w + int(10*scale), card_y + card_h - int(15*scale)]
        draw.rounded_rectangle(back_card, radius=int(22*scale), fill=(30, 41, 59, 255), outline=(14, 165, 233, 140), width=max(1, int(3*scale)))
        # Front card
        front_card = [card_x, card_y, card_x + card_w, card_y + card_h]
        draw.rounded_rectangle(front_card, radius=int(22*scale), fill=(14, 165, 233, 255), outline=(56, 189, 248, 255), width=max(2, int(4*scale)))
        # Card chip
        chip_x = card_x + int(35 * scale)
        chip_y = card_y + int(35 * scale)
        draw.rounded_rectangle([chip_x, chip_y, chip_x + int(48*scale), chip_y + int(36*scale)], radius=int(6*scale), fill=(254, 240, 138, 255), outline=(202, 138, 4, 255), width=max(1, int(2*scale)))
        # Balance Bars
        draw.rounded_rectangle([chip_x, card_y + int(105*scale), chip_x + int(130*scale), card_y + int(122*scale)], radius=int(6*scale), fill=(255, 255, 255, 240))
        draw.rounded_rectangle([chip_x, card_y + int(136*scale), chip_x + int(75*scale), card_y + int(148*scale)], radius=int(5*scale), fill=(255, 255, 255, 140))
        # Rp Text
        rp_font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(32 * scale))
        draw.text((card_x + card_w - int(65*scale), card_y + int(32*scale)), "Rp", font=rp_font, fill=(255, 255, 255, 240))
        # Realtime Lightning Badge
        bx = int(375 * scale)
        by = int(140 * scale)
        br = int(48 * scale)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        # Lightning Bolt
        bolt_pts = [
            (bx + int(4*scale), by - int(24*scale)),
            (bx - int(18*scale), by + int(4*scale)),
            (bx - int(2*scale), by + int(4*scale)),
            (bx - int(8*scale), by + int(26*scale)),
            (bx + int(18*scale), by - int(2*scale)),
            (bx + int(2*scale), by - int(2*scale))
        ]
        draw.polygon(bolt_pts, fill=(254, 240, 138, 255), outline=(234, 179, 8, 255))

    elif tab_type == 'produk':
        # Shopping Bag
        bx = int(256 * scale)
        by = int(245 * scale)
        bag_w = int(105 * scale)
        bag_h = int(140 * scale)
        # Handles (two arches)
        handle_bbox = [bx - int(45*scale), by - bag_h - int(24*scale), bx + int(45*scale), by - bag_h + int(36*scale)]
        draw.arc(handle_bbox, start=180, end=0, fill=(199, 210, 254, 255), width=max(3, int(10*scale)))
        # Main Bag Polygon (Trapezoid)
        top_y = by - bag_h + int(10*scale)
        bot_y = by + int(45*scale)
        bag_poly = [
            (bx - int(85*scale), top_y),
            (bx + int(85*scale), top_y),
            (bx + int(105*scale), bot_y),
            (bx - int(105*scale), bot_y)
        ]
        draw.polygon(bag_poly, fill=(99, 102, 241, 255), outline=(165, 180, 252, 255))
        # Top fold
        draw.polygon([(bx - int(85*scale), top_y), (bx + int(85*scale), top_y), 
                      (bx + int(80*scale), top_y + int(18*scale)), (bx - int(80*scale), top_y + int(18*scale))], fill=(224, 231, 255, 80))
        # Barcode Stripes on Bag
        bc_y = by - int(45*scale)
        for idx, w in enumerate([4, 8, 3, 10, 5, 8, 4, 12]):
            xpos = bx - int(40*scale) + (idx * int(11*scale))
            draw.rectangle([xpos, bc_y, xpos + int(w*scale*0.7), bc_y + int(38*scale)], fill=(255, 255, 255, 230))
        # Retail Tag (Hanging)
        tx = bx - int(92 * scale)
        ty = top_y + int(30 * scale)
        tag_poly = [
            (tx, ty),
            (tx + int(24*scale), ty + int(10*scale)),
            (tx + int(18*scale), ty + int(42*scale)),
            (tx - int(6*scale), ty + int(32*scale))
        ]
        draw.polygon(tag_poly, fill=(245, 158, 11, 255), outline=(255, 255, 255, 255))
        # Top-Right Star / Stock Badge
        sb_x = int(375 * scale)
        sb_y = int(140 * scale)
        sb_r = int(48 * scale)
        draw.ellipse([sb_x - sb_r, sb_y - sb_r, sb_x + sb_r, sb_y + sb_r], fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        # Star inside badge
        star_pts = []
        for i in range(10):
            angle = i * math.pi / 5.0 - math.pi / 2.0
            radius = int(22 * scale) if i % 2 == 0 else int(10 * scale)
            star_pts.append((sb_x + int(radius * math.cos(angle)), sb_y + int(radius * math.sin(angle))))
        draw.polygon(star_pts, fill=(255, 255, 255, 255))

    else: # margin
        base_y = int(310 * scale)
        bw = int(38 * scale)
        spacing = int(16 * scale)
        start_x = int(130 * scale)
        h_list = [int(55*scale), int(95*scale), int(140*scale), int(85*scale)]
        for idx, h in enumerate(h_list):
            cur_x = start_x + idx * (bw + spacing)
            draw.rounded_rectangle([cur_x, base_y - h, cur_x + bw, base_y], radius=int(6*scale), fill=(16, 185, 129, 255), outline=(110, 231, 183, 200), width=max(1, int(2*scale)))
        # Trend Polyline
        trend_pts = [
            (start_x + int(19*scale), base_y - int(65*scale)),
            (start_x + int(73*scale), base_y - int(108*scale)),
            (start_x + int(127*scale), base_y - int(155*scale)),
            (start_x + int(181*scale), base_y - int(100*scale))
        ]
        draw.line(trend_pts, fill=(251, 191, 36, 255), width=max(2, int(6*scale)), joint="curve")
        bx = int(375 * scale)
        by = int(140 * scale)
        br = int(48 * scale)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(5, 150, 105, 255), outline=(255, 255, 255, 255), width=max(2, int(4*scale)))
        pct_font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(36 * scale))
        draw.text((bx - int(15*scale), by - int(24*scale)), "%", font=pct_font, fill=(255, 255, 255, 255))

    # 3. Bottom Pill with Tab Name
    pill_w = int(270 * scale)
    pill_h = int(68 * scale)
    px1 = (size - pill_w) // 2
    py1 = int(392 * scale)
    px2 = px1 + pill_w
    py2 = py1 + pill_h

    pill_overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(pill_overlay)
    p_draw.rounded_rectangle([px1, py1, px2, py2], radius=pill_h // 2, fill=pill_bg, outline=pill_border, width=max(1, int(3*scale)))
    final_img = Image.alpha_composite(final_img, pill_overlay)
    draw = ImageDraw.Draw(final_img)

    font_size = int(34 * scale)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", font_size)
    except:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), pill_text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = py1 + (pill_h - th) // 2 - int(4 * scale)
    draw.text((tx, ty), pill_text, font=font, fill=(255, 255, 255, 255))

    return final_img

if __name__ == "__main__":
    tabs = ['order', 'history', 'daily', 'margin', 'balance', 'produk']
    for tab in tabs:
        img192 = create_tab_icon(tab, 192)
        img192.save(f"web/github_pages/icon-{tab}-192.png", "PNG")
        img512 = create_tab_icon(tab, 512)
        img512.save(f"web/github_pages/icon-{tab}-512.png", "PNG")
        print(f"Generated PNGs for {tab}: icon-{tab}-192.png, icon-{tab}-512.png")
