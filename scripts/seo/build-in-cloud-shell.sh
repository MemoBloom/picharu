#!/usr/bin/env bash
set -euo pipefail
# Run inside the reviewed source archive, in authenticated Cloud Shell.
# Reuse existing build infrastructure; do not change IAM, deploy or execute jobs.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir/../.."
revision="$(cat seo-source-revision.txt)"
if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' 'Invalid source revision. Use the prepared SEO source archive.' >&2
  exit 1
fi
command -v gcloud >/dev/null
project_id=picjp-staging
region=asia-northeast1
builder_email="picjp-image-builder@$project_id.iam.gserviceaccount.com"
source_bucket="$project_id-picjp-build-$region"
image_tag="seo-${revision:0:12}"
# Existing Worker build resources are inspected and reused, never recreated here.
gcloud artifacts repositories describe picjp --project="$project_id" --location="$region" --format='value(name)'
gcloud iam service-accounts describe "$builder_email" --project="$project_id" --format='value(email)'
gcloud storage buckets describe "gs://$source_bucket" --project="$project_id" --format='value(name)'
gcloud builds submit . --project="$project_id" --region="$region" \
  --config=cloudbuild.seo.yaml \
  --service-account="projects/$project_id/serviceAccounts/$builder_email" \
  --gcs-source-staging-dir="gs://$source_bucket/source" \
  --substitutions="_IMAGE_TAG=$image_tag" --timeout=1200s
printf '\nSEO_BUILD_OK source=%s\n' "$revision"
printf 'image=asia-northeast1-docker.pkg.dev/%s/picjp/seo-collector:%s\n' "$project_id" "$image_tag"
