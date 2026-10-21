import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

SERVICE_ACCOUNT = 'picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com'
SCOPES = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly',
]

def http_error(stage, error):
    reasons = []
    try:
        payload = json.loads(error.read(65536))
        for detail in payload.get('error', {}).get('details', []):
            reason = detail.get('reason', '')
            if isinstance(reason, str) and reason and len(reason) <= 100 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789' for c in reason):
                reasons.append(reason)
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    return {'stage': stage, 'ok': False, 'http_status': error.code,
            'code': 'GOOGLE_REQUEST_FAILED', 'reasons': reasons}

def main():
    # Stable gcloud does not accept --scopes here. The logged-in user's token only authorizes IAM.
    token_process = subprocess.run([
        'gcloud', 'auth', 'print-access-token', '--project=picjp-staging', '--quiet',
    ], capture_output=True, text=True, timeout=90)
    if token_process.returncode or not token_process.stdout.strip():
        print(json.dumps({'stage': 'cloud_shell_login', 'ok': False,
                          'code': 'GCLOUD_LOGIN_FAILED'}))
        return 1
    iam_url = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + SERVICE_ACCOUNT + ':generateAccessToken'
    request = urllib.request.Request(iam_url,
        data=json.dumps({'scope': SCOPES, 'lifetime': '900s'}).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token_process.stdout.strip(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            credentials = json.loads(response.read(65536))
        token = credentials.get('accessToken')
        if not isinstance(token, str) or not token:
            raise ValueError('Missing service identity')
    except urllib.error.HTTPError as error:
        print(json.dumps(http_error('service_identity', error)))
        return 1
    except (OSError, ValueError, AttributeError):
        print(json.dumps({'stage': 'service_identity', 'ok': False, 'code': 'IAM_RESPONSE_FAILED'}))
        return 1
    results = []
    for source, timezone in [('gsc', 'America/Los_Angeles'), ('ga4', 'Asia/Tokyo')]:
        day = (datetime.datetime.now(ZoneInfo(timezone)).date() - datetime.timedelta(days=3)).isoformat()
        if source == 'gsc':
            url = 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Apicmoko.com/searchAnalytics/query'
            body = {'startDate': day, 'endDate': day, 'type': 'web', 'dataState': 'final', 'rowLimit': 1}
        else:
            url = 'https://analyticsdata.googleapis.com/v1beta/properties/559730643:runReport'
            body = {'dateRanges': [{'startDate': day, 'endDate': day}],
                    'metrics': [{'name': 'eventCount'}], 'limit': 1}
        request = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status = response.status
                payload = json.loads(response.read(1048576))
            if not 200 <= status < 300 or not isinstance(payload, dict) or 'error' in payload:
                raise ValueError('Unexpected report response')
            rows = payload.get('rows', [])
            if not isinstance(rows, list):
                raise ValueError('Unexpected rows')
            result = {'source': source, 'day': day, 'http_status': status, 'ok': True,
                      'data_state': 'available' if rows else 'empty'}
        except urllib.error.HTTPError as error:
            result = dict(http_error(source, error), source=source, day=day)
        except (OSError, ValueError):
            result = {'source': source, 'day': day, 'ok': False, 'code': 'GOOGLE_REPORT_RESPONSE_FAILED'}
        results.append(result)
        print(json.dumps(result))
    return 0 if all(item['ok'] for item in results) else 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.SubprocessError):
        print(json.dumps({'stage': 'identity', 'ok': False, 'code': 'GCLOUD_UNAVAILABLE_OR_TIMEOUT'}))
        sys.exit(1)
