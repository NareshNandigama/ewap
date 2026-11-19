#!/bin/sh
set -eu
export DB_CA_CERT="$(cat /tls/ca.crt)"
exec "$@"
