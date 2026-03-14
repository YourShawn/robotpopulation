import mongoose from 'mongoose';

const CanonicalEventSchema = new mongoose.Schema(
  {
    eventFingerprint: { type: String, unique: true, index: true },
    company: { type: String, index: true },
    companyCanonical: { type: String, index: true },
    robotType: { type: String, index: true },
    eventType: { type: String, index: true },
    city: { type: String, index: true },
    cityCanonical: { type: String, index: true },
    province: { type: String, default: 'Unknown', index: true },
    country: { type: String, default: 'Unknown', index: true },
    location: { lat: Number, lon: Number },
    eventDate: { type: Date, index: true },
    countBest: { type: Number, default: null },
    countMin: { type: Number, default: null },
    countMax: { type: Number, default: null },
    sourceUrls: [String],
    sourceSites: [String],
    sourceCount: { type: Number, default: 0 },
    confidence: { type: Number, default: 0.2 },
    firstSeen: Date,
    lastSeen: Date
  },
  { timestamps: true }
);

export const CanonicalEvent = mongoose.model('CanonicalEvent', CanonicalEventSchema);
