import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true
    },
    sourceConversationId: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

export const Note = mongoose.model('Note', noteSchema);
