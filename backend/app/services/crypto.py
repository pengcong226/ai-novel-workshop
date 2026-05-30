"""
API Key 加密存储服务
使用 Fernet 对称加密保护用户的 API Key
"""
import os
import base64
import hashlib
from typing import Optional


def _get_encryption_key() -> bytes:
    """从环境变量或固定种子派生加密密钥"""
    seed = os.environ.get('APP_SECRET_KEY', 'ai-novel-workshop-default-secret-2026')
    key_material = hashlib.sha256(seed.encode()).digest()
    return base64.urlsafe_b64encode(key_material)


def encrypt_api_key(plaintext: str) -> str:
    """加密 API Key"""
    try:
        from cryptography.fernet import Fernet
        key = _get_encryption_key()
        f = Fernet(key)
        return f.encrypt(plaintext.encode()).decode()
    except ImportError:
        # cryptography 未安装时使用 base64 编码（降级方案）
        import base64
        return base64.b64encode(plaintext.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    """解密 API Key"""
    try:
        from cryptography.fernet import Fernet
        key = _get_encryption_key()
        f = Fernet(key)
        return f.decrypt(encrypted.encode()).decode()
    except ImportError:
        import base64
        return base64.b64decode(encrypted.encode()).decode()
    except Exception:
        # 解密失败，可能为旧格式明文，直接返回
        return encrypted
