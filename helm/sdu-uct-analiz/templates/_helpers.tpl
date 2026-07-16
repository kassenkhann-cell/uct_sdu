{{- define "sdu-uct-analiz.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sdu-uct-analiz.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sdu-uct-analiz.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sdu-uct-analiz.labels" -}}
helm.sh/chart: {{ include "sdu-uct-analiz.chart" . }}
app.kubernetes.io/name: {{ include "sdu-uct-analiz.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "sdu-uct-analiz.appSelectorLabels" -}}
app.kubernetes.io/name: {{ include "sdu-uct-analiz.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: application
{{- end }}

{{- define "sdu-uct-analiz.clickhouseSelectorLabels" -}}
app.kubernetes.io/name: {{ include "sdu-uct-analiz.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: clickhouse
{{- end }}

{{- define "sdu-uct-analiz.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "sdu-uct-analiz.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "sdu-uct-analiz.secretName" -}}
{{- default (printf "%s-secrets" (include "sdu-uct-analiz.fullname" .)) .Values.secrets.existingSecret }}
{{- end }}

{{- define "sdu-uct-analiz.clickhouseHost" -}}
{{- if .Values.clickhouse.enabled }}
{{- printf "%s-clickhouse" (include "sdu-uct-analiz.fullname" .) }}
{{- else }}
{{- required "clickhouse.external.host is required when clickhouse.enabled=false" .Values.clickhouse.external.host }}
{{- end }}
{{- end }}
