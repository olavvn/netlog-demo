# 사진을 Cloudinary에 업로드하고 URL을 반환

import cloudinary
import cloudinary.uploader
from app.core.config import settings

# .env에서 읽어온 값으로 Cloudinary 연결 설정
cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret
) 

# 사진 bytes 받아서 Cloudinary에 올리고 URL 반환
def upload_image(file_bytes: bytes, folder: str = "netlog") -> str:
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=folder,
        resource_type="image"
    )
    return result["secure_url"]