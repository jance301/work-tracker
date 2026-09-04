const { google } = require('googleapis');
const { REDIRECT_URI } = require('./oauth-server');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Google Calendar colorId → hex color
const GCal_COLORS = {
  '1':  '#7986CB', '2':  '#33B679', '3':  '#8E24AA', '4':  '#E67C73',
  '5':  '#F6BF26', '6':  '#F4511E', '7':  '#039BE5', '8':  '#616161',
  '9':  '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

class CalendarService {
  constructor(clientId, clientSecret, tokens) {
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }
    // Forward token-refresh events so caller can persist new tokens
    this.onTokensRefresh = null;
    this.oauth2Client.on('tokens', (newTokens) => {
      if (this.onTokensRefresh) this.onTokensRefresh(newTokens);
    });
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // always returns refresh_token
    });
  }

  async getTokensFromCode(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  async getEvents(timeMin, timeMax) {
    const res = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });
    return (res.data.items || []).map(ev => ({
      id:          ev.id,
      title:       ev.summary || '(No title)',
      description: ev.description || '',
      location:    ev.location || '',
      color:       GCal_COLORS[ev.colorId] || '#6c8ef5',
      allDay:      !!ev.start.date,
      start:       ev.start.dateTime || ev.start.date,
      end:         ev.end.dateTime   || ev.end.date,
      htmlLink:    ev.htmlLink || '',
    }));
  }

  async createEvent(data) {
    const body = {
      summary:     data.title,
      description: data.description || '',
      location:    data.location || '',
    };
    if (data.allDay) {
      body.start = { date: data.startDate };
      body.end   = { date: data.endDate || data.startDate };
    } else {
      body.start = { dateTime: data.startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      body.end   = { dateTime: data.endDateTime,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    const res = await this.calendar.events.insert({ calendarId: 'primary', requestBody: body });
    return res.data;
  }

  async deleteEvent(eventId) {
    await this.calendar.events.delete({ calendarId: 'primary', eventId });
  }
}

module.exports = CalendarService;
