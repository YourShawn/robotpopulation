import mongoose from 'mongoose';

const RawArticleSchema = new mongoose.Schema(
  {
    title: String,
    url: { type: String, index: true },
    normalizedUrl: { type: String, index: true },
    sourceSite: { type: String, index: true },
    sourceType: { type: String, default: 'news', index: true },
    publishedAt: Date,
    snippet: String,
    content: String,
    query: String,
    fetchBatchId: { type: String, index: true }
  },
  { timestamps: true }
);

export const RawArticle = mongoose.model('RawArticle', RawArticleSchema);
