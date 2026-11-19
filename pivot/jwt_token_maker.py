import jwt  # PyJWT library
import datetime
import secrets

# Génération d'une clé secrète sécurisée de 32 caractères (256 bits)
secret_key = secrets.token_hex(16)  # 16 bytes -> 32 hex chars
print(f"Clé secrète (32 caractères) : {secret_key}")

# Création du payload avec des données et une expiration
payload = {
    "user_id": 123,
    "role": "admin",
    "iat": datetime.datetime.utcnow(),  # Issued At
    "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=30)  # Expiration
}

# Génération du JWT
token = jwt.encode(payload, secret_key, algorithm="HS256")
print(f"JWT : {token}")

# Décodage et vérification du JWT
try:
    decoded = jwt.decode(token, secret_key, algorithms=["HS256"])
    print("Payload décodé :", decoded)
except jwt.ExpiredSignatureError:
    print("Erreur : le token a expiré.")
except jwt.InvalidTokenError:
    print("Erreur : token invalide.")
