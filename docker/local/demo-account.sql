BEGIN;

INSERT INTO "Organization" (id, name, "updatedAt")
VALUES ('669ae068-8033-42ef-a92f-692e68cf9331', 'Local demo', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "User" (id, name, email, "organizationId", "passwordHash", role, "updatedAt")
VALUES ('05e38aa5-1764-483c-a45a-e4da1cc67407', 'Demo member', 'local-demo@example.invalid',
        '669ae068-8033-42ef-a92f-692e68cf9331', 'disabled', 'MEMBER', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

COMMIT;
