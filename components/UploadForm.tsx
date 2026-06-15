'use client';

import { useMemo, useState } from 'react';

type UploadFormProps = {
  userEmail: string;
};

export default function UploadForm({ userEmail }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [manualTags, setManualTags] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    if (!file) return null;
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  }, [file]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setMessage('Please select a photo or video file.');
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('eventName', eventName);
    formData.append('eventDate', eventDate);
    formData.append('location', location);
    formData.append('manualTags', manualTags);
    formData.append('userEmail', userEmail);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setMessage(body.message || 'Upload failed.');
      return;
    }

    setMessage('Upload successful. Asset is being tagged.');
    setFile(null);
    setTitle('');
    setEventName('');
    setEventDate('');
    setLocation('');
    setManualTags('');
  }

  return (
    <div className="card">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">Asset title</label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Shot from home match"
          />
        </div>
        <div className="field">
          <label htmlFor="file">Photo or video</label>
          <input
            id="file"
            type="file"
            accept="image/*,video/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        {preview ? <img src={preview} alt="Preview" style={{ maxWidth: '100%', borderRadius: 12, marginBottom: 16 }} /> : null}
        <div className="field">
          <label htmlFor="eventName">Event name</label>
          <input id="eventName" value={eventName} onChange={(event) => setEventName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="eventDate">Event date</label>
          <input id="eventDate" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="location">Location</label>
          <input id="location" value={location} onChange={(event) => setLocation(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="manualTags">Manual tags</label>
          <input
            id="manualTags"
            value={manualTags}
            onChange={(event) => setManualTags(event.target.value)}
            placeholder="sponsor, player name, coach"
          />
        </div>
        {message ? <div className="alert">{message}</div> : null}
        <button type="submit" disabled={submitting}>{submitting ? 'Uploading…' : 'Upload asset'}</button>
      </form>
    </div>
  );
}
