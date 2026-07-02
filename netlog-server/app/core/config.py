from pydantic_settings import BaseSettings # .env 파일 자동으로 읽어오기

class Settings(BaseSettings):
    secret_key: str
    database_url: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 180 # 로그인 토큰이 3시간 후에 만료
    cloudinary_cloud_name: str
    cloudinary_api_key: str
    cloudinary_api_secret: str

    class Config:
        env_file = ".env"

settings = Settings()


# .env 파일에 저장된 환경변수를 파이썬 코드 내에서 쓸 수 있게 불러오는 파일