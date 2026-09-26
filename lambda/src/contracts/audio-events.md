# Audio workflow event contracts

## AudioUploaded event (backend -> Lambda)

```json
{
  "version": "2026-09-26",
  "type": "AudioUploaded",
  "sessionId": "uuid",
  "bucket": "audio-bucket",
  "objectKey": "sessions/<sessionId>/input.webm",
  "transcribeOutputBucket": "transcribe-output-bucket",
  "requestedAt": "2026-09-26T00:00:00.000Z"
}
```

## TranscribeCompleted event (EventBridge/Lambda)

```json
{
  "version": "2026-09-26",
  "type": "TranscribeCompleted",
  "sessionId": "uuid",
  "transcript": "candidate answer text",
  "languageCode": "en-US"
}
```
