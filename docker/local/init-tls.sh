#!/bin/sh
set -eu
# Persist one local CA per Compose project. Never overwrite an existing identity.
if [ ! -s /tls/ca.crt ]; then
  umask 077
  openssl req -x509 -newkey rsa:2048 -nodes -keyout /tls/ca.key -out /tls/ca.crt -days 365 -subj '/CN=EWAP local development CA'
fi
for service in postgres gateway; do
  if [ ! -s "/tls/$service.crt" ]; then
    openssl req -newkey rsa:2048 -nodes -keyout "/tls/$service.key" -out "/tls/$service.csr" -subj "/CN=$service"
    printf 'subjectAltName=DNS:%s,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n' "$service" > "/tls/$service.ext"
    openssl x509 -req -in "/tls/$service.csr" -CA /tls/ca.crt -CAkey /tls/ca.key -CAcreateserial -out "/tls/$service.crt" -days 365 -extfile "/tls/$service.ext"
    rm "/tls/$service.csr" "/tls/$service.ext"
  fi
done
chmod 755 /tls
chmod 644 /tls/*.crt
chmod 600 /tls/*.key
chown postgres:postgres /tls/postgres.key
