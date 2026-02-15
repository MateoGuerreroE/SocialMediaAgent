// INSTAGRAM_COMMENT
export interface InstagramCommentContent {
  value: {
    from: {
      id: string;
      username: string;
    };
    media: {
      id: string;
      media_product_type: 'FEED';
    };
    parent_id?: string; // This is only existent when there is effectively a parent comment
    id: string;
    text: string;
  };
  field: 'comments';
}

export interface InstagramCommentEvent {
  id: string; // Instagram account Id
  time: number;
  changes: InstagramCommentContent[];
}

// INSTAGRAM_DM
export interface InstagramDMEvent {
  time: number;
  id: string;
  messaging: InstagramDMContent[];
}

export interface InstagramDMContent {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  message: MetaDMData;
}

export type MetaDMData = {
  mid: string;
  text?: string;
  is_deleted?: boolean;
  attachments?: Array<{
    type: string;
    payload: {
      url: string;
    };
  }>;
};

// FACEBOOK_COMMENT
export interface FacebookCommentContent {
  value: {
    from: {
      id: string;
      name: string;
    };
    post: {
      status_type: string;
      is_published: boolean;
      updated_time: string;
      permalink_url: string;
      promotion_status: string;
      id: string;
    };
    message: string;
    post_id: string;
    comment_id: string;
    created_time: number;
    item: 'comment';
    parent_id?: string; // This aims to the post_id when first level or prev comment id If second level
    verb: 'add' | 'remove' | 'edited';
  };
  field: 'feed';
}

export interface FacebookCommentEvent {
  id: string; // Facebook account Id
  time: number;
  changes: FacebookCommentContent[];
  object: 'page';
}

// FACEBOOK_DM
export interface FacebookDMEvent {
  id: string; // Facebook account Id
  time: number;
  messaging: FacebookDMContent[];
}

export interface FacebookDMContent {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  message: MetaDMData;
}

// GENERAL
export type InstagramEvent = InstagramCommentEvent | InstagramDMEvent;
export type FacebookEvent = FacebookCommentEvent | FacebookDMEvent;

export type MetaEntry<T> = { entry: Array<T>; object?: string };
