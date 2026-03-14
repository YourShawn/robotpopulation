import mongoose from 'mongoose';

const RawItemSchema = new mongoose.Schema(
  {
    query: { type: String, index: true },
    source: { type: String, default: 'search' },
    sourceUrl: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    title: String,
    snippet: String,
    contentHash: { type: String, required: true },
    city: { type: String, default: 'Unknown', index: true },
    country: { type: String, default: 'Unknown', index: true },
    location: {
      lat: Number,
      lon: Number
    },
    tags: [String],
    company: { type: String, default: 'Unknown', index: true },
    robotType: { type: String, default: 'unknown', index: true },
    deploymentStatus: { type: String, default: 'unknown', index: true },
    fleetSize: { type: Number, default: null },
    sourceType: { type: String, default: 'news', index: true },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

RawItemSchema.index({ normalizedUrl: 1 }, { unique: true });
RawItemSchema.index({ contentHash: 1 }, { unique: true });

export const RawItem = mongoose.model('RawItem', RawItemSchema);
