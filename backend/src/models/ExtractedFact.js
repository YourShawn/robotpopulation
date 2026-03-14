import mongoose from 'mongoose';

const ExtractedFactSchema = new mongoose.Schema(
  {
    rawArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawArticle', index: true },
    company: { type: String, index: true },
    companyCanonical: { type: String, index: true },
    robotType: { type: String, index: true },
    eventType: { type: String, index: true },
    city: { type: String, index: true },
    cityCanonical: { type: String, index: true },
    province: { type: String, default: 'Unknown', index: true },
    country: { type: String, default: 'Unknown', index: true },
    location: { lat: Number, lon: Number },
    countBest: { type: Number, default: null },
    countMin: { type: Number, default: null },
    countMax: { type: Number, default: null },
    eventDate: { type: Date, default: null },
    confidence: { type: Number, default: 0.2 },
    sourceUrl: String,
    sourceSite: String
  },
  { timestamps: true }
);

export const ExtractedFact = mongoose.model('ExtractedFact', ExtractedFactSchema);
