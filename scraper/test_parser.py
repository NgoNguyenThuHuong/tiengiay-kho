import unittest
from parser import parse_product, parse_price

class TestParser(unittest.TestCase):
    def test_parse_price(self):
        self.assertEqual(parse_price("550.000đ"), (550000, "550.000đ"))
        self.assertEqual(parse_price("Thỏa thuận"), (None, "Thỏa thuận"))
        self.assertEqual(parse_price("1.234.567 VNĐ"), (1234567, "1.234.567 VNĐ"))
        self.assertEqual(parse_price("Giá: 12.000 đ"), (12000, "12.000 đ"))
        self.assertEqual(parse_price("Liên hệ"), (None, None))

    def test_parse_product(self):
        html_fixture = """
        <html>
        <head>
            <meta property="og:title" content="Tiền giấy Việt Nam 1990">
            <meta name="description" content="Mô tả tiền xưa rất đẹp">
        </head>
        <body>
            <h1>Tiền giấy Việt Nam 1990</h1>
            <div>550.000đ</div>
            <div class="mota">Tờ tiền cũ đẹp, không rách</div>
            <img src="/upload/img_370x700.jpg">
            <div class="breadcrumb"><a href="/tien-xua-viet-nam">Tiền xưa</a></div>
        </body>
        </html>
        """
        data = parse_product(html_fixture, "https://tiengiay.vn/tien-giay-viet-nam-1990")
        self.assertIsNotNone(data)
        self.assertEqual(data["title"], "Tiền giấy Việt Nam 1990")
        self.assertEqual(data["price_vnd"], 550000)
        self.assertEqual(data["price_text"], "550.000đ")
        self.assertIn("Tờ tiền cũ đẹp, không rách", data["description"])
        self.assertEqual(data["category_slug"], "tien-xua-viet-nam")
        self.assertEqual(len(data["images"]), 1)
        self.assertEqual(data["images"][0]["sized"], "https://tiengiay.vn/upload/img_370x700.jpg")
        self.assertEqual(data["images"][0]["original"], "https://tiengiay.vn/upload/img.jpg")

    def test_parse_product_missing_data(self):
        html_fixture = "<html><body><h1>Không có giá hoặc ảnh</h1></body></html>"
        data = parse_product(html_fixture, "https://tiengiay.vn/no-data")
        self.assertIsNone(data)

if __name__ == "__main__":
    unittest.main()
