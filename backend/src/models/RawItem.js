import mongoose from 'mongoose';

const RawItemSchema = new mongoose.Schema(
  {
    query: { type: String, index: true },
    source: { type: String, default: 'search' },
    sourceUrl: { type: String, required: true },
    normalizedUrl: { type: String, required: true, index: true },
    title: String,
    snippet: String,
    contentHash: { type: String, required: true, index: true },
    city: { type: String, default: 'Unknown', index: true },
    country: { type: String, default: 'Unknown', index: true },
    location: {
      lat: Number,
      lon: Number
    },
    tags: [String]
  },
  { timestamps: true }
);

RawItemSchema.index({ normalizedUrl: 1 }, { unique: true });
RawItemSchema.index({ contentHash: 1 }, { unique: true });

export const RawItem = mongoose.model('RawItem', RawItemSchema);
