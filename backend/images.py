import base64
import io
import re
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException

Image.MAX_IMAGE_PIXELS = 20_000_000

def normalize_image(value: str) -> bytes:
    match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', value)
    if not match:
        raise HTTPException(422, 'Envie uma fotografia JPG, PNG ou WebP.')
    try:
        raw = base64.b64decode(match[2], validate=True)
        if len(raw) > 8 * 1024 * 1024:
            raise HTTPException(413, 'A fotografia deve ter no máximo 8 MB.')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as original:
                if original.format not in ('JPEG', 'PNG', 'WEBP'):
                    raise ValueError('format')
                original.load()
                image = ImageOps.exif_transpose(original).convert('RGB')
                image.thumbnail((1600, 1600))
                output = io.BytesIO()
                image.save(output, format='JPEG', quality=85)
                return output.getvalue()
    except HTTPException:
        raise
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Não foi possível ler a fotografia. Envie outro arquivo.') from None
