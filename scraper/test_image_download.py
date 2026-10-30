import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scrape import image_file_is_valid, image_validation_error, save_valid_image


def png_bytes(color):
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color).save(buffer, format="PNG")
    return buffer.getvalue()


class TestImageDownload(unittest.TestCase):
    def test_accepts_valid_image_content(self):
        self.assertIsNone(image_validation_error(png_bytes("red"), "image/png"))

    def test_rejects_non_image_content_type(self):
        self.assertIn("Content-Type", image_validation_error(png_bytes("red"), "text/html"))

    def test_rejects_html_even_if_content_type_claims_image(self):
        self.assertIn(
            "Dữ liệu ảnh không hợp lệ",
            image_validation_error("<!doctype html><title>Lỗi: 404</title>".encode("utf-8"), "image/jpeg"),
        )

    def test_replaces_corrupt_file_only_after_validating_download(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "0.jpg"
            original = "<!doctype html><title>Lỗi: 404</title>".encode("utf-8")
            dest.write_bytes(original)

            self.assertFalse(save_valid_image(original, "text/html", dest))
            self.assertEqual(dest.read_bytes(), original)

            self.assertTrue(save_valid_image(png_bytes("blue"), "image/png", dest))
            self.assertTrue(image_file_is_valid(dest))

    def test_never_overwrites_an_existing_valid_image(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "0.png"
            original = png_bytes("red")
            dest.write_bytes(original)

            self.assertTrue(save_valid_image(png_bytes("blue"), "image/png", dest))
            self.assertEqual(dest.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
