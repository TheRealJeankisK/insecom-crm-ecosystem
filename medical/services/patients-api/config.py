import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "local")
    
    # MySQL Database Configs
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "db")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", 3306))
    MYSQL_DATABASE: str = os.getenv("MYSQL_DATABASE", "sgip_db")
    MYSQL_USER: str = os.getenv("MYSQL_USER", "sgip_user")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "sgip_secure_pass")
    
    # Redis Configs
    REDIS_HOST: str = os.getenv("REDIS_HOST", "cache")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", 6379))
    
    # RabbitMQ Queue Configs
    RABBITMQ_HOST: str = os.getenv("RABBITMQ_HOST", "queue")
    RABBITMQ_PORT: int = int(os.getenv("RABBITMQ_PORT", 5672))
    RABBITMQ_USER: str = os.getenv("RABBITMQ_USER", "guest")
    RABBITMQ_PASSWORD: str = os.getenv("RABBITMQ_PASSWORD", "guest")
    RABBITMQ_QUEUE: str = os.getenv("RABBITMQ_QUEUE", "patients_notifications")
    
    # Azure Service Bus Configs
    AZURE_SERVICE_BUS_CONNECTION_STRING: str = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "")
    AZURE_SERVICE_BUS_QUEUE_NAME: str = os.getenv("AZURE_SERVICE_BUS_QUEUE_NAME", "patients-queue")

    # Seed Credentials Configs
    SEED_ADMIN_PASSWORD: str = os.getenv("SEED_ADMIN_PASSWORD", "admin123")
    SEED_DOCTOR_PASSWORD: str = os.getenv("SEED_DOCTOR_PASSWORD", "doctor123")

    @property
    def database_url(self) -> str:
        return f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"

# Instantiate global settings
settings = Settings()
