# Kubernetes deployment

Chart: `helm/sdu-uct-analiz`.

The default installation runs two application replicas and one immutable
ClickHouse replica. The ClickHouse image already contains the three `gold.*`
tables used by the dashboard; the chart deliberately has no migration or seed
Job and mounts no empty volume over `/var/lib/clickhouse`.

## Install

```bash
helm upgrade --install sdu-uct ./helm/sdu-uct-analiz \
  --namespace sdu-uct --create-namespace \
  --set-string secrets.llmApiKey="$LLM_API_KEY"
```

For production, create a Kubernetes Secret yourself and avoid putting secrets
in shell history:

```bash
kubectl -n sdu-uct create secret generic sdu-uct-secrets \
  --from-literal=clickhouse-password='<strong-password>' \
  --from-literal=llm-api-key='<llm-api-key>'

helm upgrade --install sdu-uct ./helm/sdu-uct-analiz \
  --namespace sdu-uct --create-namespace \
  --set secrets.existingSecret=sdu-uct-secrets
```

Enable an ingress with your controller and hostname:

```bash
helm upgrade --install sdu-uct ./helm/sdu-uct-analiz \
  --namespace sdu-uct --create-namespace \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=sdu-uct.example.kz \
  --set secrets.existingSecret=sdu-uct-secrets
```

## Images and data refresh

GitHub Actions publishes:

- `ghcr.io/kassenkhann-cell/uct_sdu-app:latest`
- `ghcr.io/kassenkhann-cell/uct_sdu-clickhouse:latest`

Every build also receives an immutable `sha-<git-sha>` tag. Production releases
should pin both image tags to the same commit:

```bash
helm upgrade sdu-uct ./helm/sdu-uct-analiz \
  --namespace sdu-uct \
  --set app.image.tag=sha-<git-sha> \
  --set clickhouse.image.tag=sha-<git-sha> \
  --reuse-values
```

Updating the source dataset creates a new ClickHouse image. It does not run a
migration against the existing pod. If durable mutable data is later required,
switch `clickhouse.enabled=false` and provide an external ClickHouse host that
implements the same fully-qualified table contract.

## External ClickHouse

```bash
helm upgrade --install sdu-uct ./helm/sdu-uct-analiz \
  --namespace sdu-uct --create-namespace \
  --set clickhouse.enabled=false \
  --set clickhouse.external.host=clickhouse.internal \
  --set clickhouse.external.port=8443 \
  --set clickhouse.external.secure=true \
  --set secrets.existingSecret=sdu-uct-secrets
```
