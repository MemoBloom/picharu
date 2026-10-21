"""Offline contract/error tests. Never run gcloud or contact Google."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
SUBJECT = runpy.run_path(str(ROOT / 'scripts/seo/google-read-preflight.py'))
USER_TOKEN = 'fixture-user-token-must-not-be-logged'
SERVICE_TOKEN = 'fixture-service-token-must-not-be-logged'


def response(payload):
    if isinstance(payload, Exception):
        return payload
    result = MagicMock()
    result.__enter__.return_value = result
    result.status = 200
    result.read.return_value = json.dumps(payload).encode()
    return result


def denied(reason):
    body = json.dumps({'error': {'message': 'private-upstream-message',
                               'details': [{'reason': reason}]}}).encode()
    return urllib.error.HTTPError('https://example.invalid', 403,
                                  'private-upstream-error', None, io.BytesIO(body))


class GoogleReadPreflightTest(unittest.TestCase):
    def test_scoped_identity_exchange_and_report_error_matrix(self):
        cases = [
            ([{'accessToken': SERVICE_TOKEN}, {'rows': [{}]}, {'rows': [{}]}], 0, 'available'),
            ([{'accessToken': SERVICE_TOKEN}, {}, {}], 0, 'empty'),
            ([denied('IAM_PERMISSION_DENIED')], 1, 'IAM_PERMISSION_DENIED'),
            ([denied('SERVICE_DISABLED')], 1, 'SERVICE_DISABLED'),
            ([{'accessToken': SERVICE_TOKEN}, denied('IAM_PERMISSION_DENIED'), {}], 1, 'IAM_PERMISSION_DENIED'),
            ([{'accessToken': SERVICE_TOKEN}, {}, denied('ACCESS_TOKEN_SCOPE_INSUFFICIENT')], 1, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'),
            ([{'accessToken': SERVICE_TOKEN}, {'rows': 'invalid'}, {}], 1, 'GOOGLE_REPORT_RESPONSE_FAILED'),
            ([{'accessToken': SERVICE_TOKEN}, urllib.error.URLError('private-upstream-message'), {}], 1, 'GOOGLE_REPORT_RESPONSE_FAILED'),
            ([{}], 1, 'IAM_RESPONSE_FAILED'),
            (['not-an-object'], 1, 'IAM_RESPONSE_FAILED'),
        ]
        for index, (payloads, status, signal) in enumerate(cases):
            with self.subTest(index=index):
                output = io.StringIO()
                with patch('subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=USER_TOKEN)) as command, \
                     patch('urllib.request.urlopen', side_effect=[response(p) for p in payloads]) as transport, \
                     contextlib.redirect_stdout(output):
                    self.assertEqual(SUBJECT['main'](), status)
                    # Guard the actual stable CLI interface: custom scope belongs in IAM JSON, not a gcloud flag.
                    self.assertEqual(command.call_args.args[0], [
                        'gcloud', 'auth', 'print-access-token', '--project=picjp-staging', '--quiet'])
                    requests = [call.args[0] for call in transport.call_args_list]
                    self.assertEqual(requests[0].full_url,
                        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'
                        'picmoko-seo-reader@picjp-staging.iam.gserviceaccount.com:generateAccessToken')
                    self.assertEqual(json.loads(requests[0].data), {'scope': [
                        'https://www.googleapis.com/auth/webmasters.readonly',
                        'https://www.googleapis.com/auth/analytics.readonly'], 'lifetime': '900s'})
                    self.assertEqual(requests[0].get_header('Authorization'), 'Bearer ' + USER_TOKEN)
                    for request in requests[1:]:
                        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + SERVICE_TOKEN)
                text = output.getvalue()
                self.assertIn(signal, text)
                for secret in [USER_TOKEN, SERVICE_TOKEN, 'private-upstream-message', 'private-upstream-error']:
                    self.assertNotIn(secret, text)

    def test_login_failure_stops_before_any_http_request(self):
        output = io.StringIO()
        with patch('subprocess.run', return_value=SimpleNamespace(returncode=1, stdout='', stderr='private-upstream-error')), \
             patch('urllib.request.urlopen') as transport, contextlib.redirect_stdout(output):
            self.assertEqual(SUBJECT['main'](), 1)
            transport.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['stage'], 'cloud_shell_login')
        self.assertNotIn('private-upstream-error', output.getvalue())


if __name__ == '__main__':
    unittest.main()
