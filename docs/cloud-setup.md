# Cloud setup: development first

No production deployment or paid resource creation is implied by these commands. Approve the configuration and cost before executing resource creation. Never paste credentials into chat, tracked files, command arguments, or workflow logs.

## Verified account state (2026-11-22)

- Repository: `josephzhangie0421/berkeley-navigator`, private, default branch `main`.
- Working branch: `redesign/fastapi-gemini-mvp`.
- GitHub CLI and SSH remote authentication both verified; Actions enabled.
- Azure: enabled `Azure for Students` subscription `fe08ef46-8061-44a2-a5d0-1212e4a2d673`, selected by the existing CLI login. No resources were listed during the initial check.
- Supabase CLI initially returned an empty project list. A development project and private database configuration are pending user setup.
- No Gemini key was configured during the initial test run.

## GitHub

Reauthentication, only if needed:

```sh
gh auth login --hostname github.com --web
gh auth status
git ls-remote origin HEAD
```

CI runs on every push/PR and uses a real PostgreSQL 17 service with isolated schemas. Routine CI needs no cloud secrets. The manual live-integration workflow uses a `development` environment with `TEST_DATABASE_URL` (dedicated development/test database only) and `GEMINI_API_KEY`. It must fail, not silently skip, when those required live credentials are absent.

Use the repository Settings → Environments interface to configure approval rules supported by your GitHub plan. Private-repository required-reviewer protections may depend on plan; do not claim they are enabled without checking. `DEPLOY_ENABLED` remains unset/false until explicit deployment approval.

To set environment secrets without command-line values:

```sh
.venv/bin/python scripts/cloud_secrets.py github --repo josephzhangie0421/berkeley-navigator --environment development
```

The script prompts invisibly and passes secret contents through stdin to `gh secret set`. Blank input skips a secret. Never use `gh secret set --body ACTUAL_SECRET` in command history.

Deployment environment variables (non-secret): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME`, `API_BASE_URL`, optional `GEMINI_MODEL`, and `DEPLOY_ENABLED`. Deployment secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`. Keep development and production values separate. The frontend gets only `API_BASE_URL`.

## Supabase

1. Open https://supabase.com/dashboard, select the correct organization and a dedicated development project. If creating one, choose `berkeley-navigator-dev`, an available nearby US region, and **Free** plan. Stop for approval if a paid plan is required. Save the generated database password privately.
2. In the project's **Connect** dialog, obtain the PostgreSQL URI. Use the Session pooler (port 5432) when direct IPv6 connectivity is unavailable. Do not use the transaction pooler for migrations. Copy the actual host and username; do not construct them from guesses. URL-encode special password characters.
3. Run `.venv/bin/python scripts/configure_local.py` and paste the URI only into its hidden local prompt. It appends `sslmode=require` for remote hosts when missing. For stronger server identity verification, configure `sslmode=verify-full` and Supabase's documented CA certificate.
4. Confirm the selected project is development. Run migration, validation and staging commands from README. Staging does not publish facts.
5. Run `scripts/create_reader.py` using the administrative URI. This creates `navigator_reader` with only published-view access and read-only transactions. Save its generated password privately. Configure backend `DATABASE_URL` with that role and keep the administrative URL separately as `MIGRATION_DATABASE_URL`. With Supabase's session pooler, the username format is `<role>.<project-ref>`; use the actual host from Connect. Do not expose `navigator` via Supabase's browser Data API.
6. Set `TEST_DATABASE_URL` privately to an administrative connection for a **dedicated development/test database**. Tests need create/drop-schema rights and only touch random `test_...` schemas. Run `pytest -q` with the real service.

Official connection guide: https://supabase.com/docs/guides/database/connecting-to-postgres . No Supabase service-role API key is needed; this application uses PostgreSQL directly.

## Gemini

1. Open https://aistudio.google.com/apikey and create/select a key for the intended project. Complete account/terms steps yourself. Verify free-tier eligibility; do not enable paid billing without approval.
2. Save the key using the hidden local configuration prompt, or edit the existing mode-0600 root `.env` privately. Use `GEMINI_API_KEY`; never set it in frontend JavaScript.
3. Run the explicit live test from README. It calls the real API and verifies native function calling. The verified default `gemini-3.5-flash-lite` is configurable; free-tier availability and quota must be confirmed for your project. The SDK is initialized explicitly with `GEMINI_API_KEY`, avoiding ambiguity if `GOOGLE_API_KEY` also exists.
4. For hosting, use `scripts/cloud_secrets.py azure` to set backend application settings securely. CI's key belongs only in the development environment for manually enabled live tests.

Official key guide: https://ai.google.dev/gemini-api/docs/api-key . Pricing: https://ai.google.dev/gemini-api/docs/pricing . Free-tier provider data handling differs from paid tiers; users should avoid entering sensitive personal information into chat.

## Azure

Existing login is valid. If it expires, run `az login` yourself. Check/select the subscription using:

```sh
az account list --query '[].{name:name,id:id,isDefault:isDefault}' -o table
az account set --subscription fe08ef46-8061-44a2-a5d0-1212e4a2d673
```

Proposed development configuration in `infra/development.parameters.json`:

| Item | Proposed value |
| --- | --- |
| Resource group | `rg-berkeley-navigator-dev` |
| Region | `westus2` |
| API | `berkeley-navigator-dev-api-jz` |
| App Service | Linux B1, one instance, Python 3.14, HTTPS-only, TLS 1.2+, FTP disabled |
| Static Web Apps | `berkeley-navigator-dev-web-jz`, Free tier |
| Database | Supabase development project, separately configured |
| Telemetry/add-ons | No Application Insights, container registry, or paid add-ons provisioned |

Microsoft's public retail API returned **$0.017/hour**, approximately **$12.41/730 hours**, for Linux B1 in West US 2. This excludes taxes, bandwidth and other usage; credits/discounts and subscription availability are account-specific. `scripts/azure_estimate.py` refreshes that quote. Student credits are not a guarantee of zero cost. F1 is an alternative only if supported by the selected subscription/region; it sleeps and has tighter limits. The supplied proposal uses B1.

Compile without creating resources:

```sh
az bicep build --file infra/main.bicep
```

After explicit resource approval only:

```sh
az group create --name rg-berkeley-navigator-dev --location westus2
az deployment group what-if --resource-group rg-berkeley-navigator-dev --template-file infra/main.bicep --parameters infra/development.parameters.json
az deployment group create --resource-group rg-berkeley-navigator-dev --template-file infra/main.bicep --parameters infra/development.parameters.json
```

Review what-if before create. Names must be available; changes in region/SKU/cost require renewed review. Outputs contain frontend/API URLs, not secrets.

Set `DATABASE_URL` to the restricted Supabase reader URI and `GEMINI_API_KEY` through private prompts:

```sh
.venv/bin/python scripts/cloud_secrets.py azure --resource-group rg-berkeley-navigator-dev --app berkeley-navigator-dev-api-jz
```

For App Service deployment, configure a Microsoft Entra application/service principal with GitHub OIDC federation scoped to `repo:josephzhangie0421/berkeley-navigator:environment:development`, audience `api://AzureADTokenExchange`, issuer `https://token.actions.githubusercontent.com`. Grant the deployment identity the narrow resource scope needed for this App Service; do not grant subscription-wide Owner. Record client, tenant and subscription IDs as environment variables. This trust/role configuration is not performed until the approved resources exist.

Store the Static Web Apps deployment token privately in the matching GitHub environment. Never print it in chat or CLI logs. `scripts/cloud_secrets.py` accepts it with a hidden prompt. Configure exact CORS origin from the created Static Web App. Then, after deployment approval, set `DEPLOY_ENABLED=true` and manually dispatch `.github/workflows/deploy.yml` for `development` on the redesign branch. The deployment runs tests first. Check `/api/ready`, UI search, citations and a real Gemini request after deployment.

Production requires separate resources/credentials, protection rules, catalog review, cost review and explicit approval. The current work does not authorize a production deployment.

Official Azure OIDC deployment guide: https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions .
