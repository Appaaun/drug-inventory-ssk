{{/* ใช้ .Chart.Name แทนชื่อ hardcode เพื่อให้ templates/ ทั้งโฟลเดอร์นี้ copy ไปใช้กับทุก service chart ได้ตรงๆ */}}
{{- define "servicechart.fullname" -}}
{{ .Chart.Name }}
{{- end -}}

{{- define "servicechart.labels" -}}
app: {{ include "servicechart.fullname" . }}
app.kubernetes.io/name: {{ include "servicechart.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
{{- end -}}
