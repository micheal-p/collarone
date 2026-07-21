// Declarative field config per block type — drives the generic block editor
// form in WebsiteBuilder.jsx so adding a new block type later means adding
// one entry here, not a new modal component.
export const BLOCK_FIELDS = {
  hero:     { simple: [['eyebrow', 'Eyebrow (small line above the heading)', 'text'], ['heading', 'Heading — wrap a word in *asterisks* to style it', 'text'], ['subheading', 'Subheading', 'textarea'], ['button_text', 'Button text', 'text'], ['button_link', 'Button link', 'text'], ['image_url', 'Background image', 'image']] },
  text:     { simple: [['heading', 'Heading', 'text'], ['body', 'Body text', 'textarea']] },
  image:    { simple: [['image_url', 'Image', 'image'], ['alt', 'Alt text', 'text'], ['caption', 'Caption', 'text']] },
  cta:      { simple: [['heading', 'Heading', 'text'], ['button_text', 'Button text', 'text'], ['button_link', 'Button link', 'text']] },
  products: { simple: [['heading', 'Heading', 'text'], ['limit', 'How many to show (0 = all)', 'number']] },
  contact_form: { simple: [] },
  subscribe: { simple: [['heading', 'Heading', 'text'], ['blurb', 'Short blurb', 'textarea'], ['button_text', 'Button text', 'text']] },
  footer:   { simple: [['note', 'Footer note', 'text']] },
  features:     { simple: [['heading', 'Heading', 'text']], repeater: { key: 'items', label: 'Feature', fields: [['title', 'Title', 'text'], ['body', 'Description', 'textarea']] } },
  faq:          { simple: [['heading', 'Heading', 'text']], repeater: { key: 'items', label: 'Question', fields: [['q', 'Question', 'text'], ['a', 'Answer', 'textarea']] } },
  testimonials: { simple: [['heading', 'Heading', 'text']], repeater: { key: 'items', label: 'Testimonial', fields: [['quote', 'Quote', 'textarea'], ['author', 'Author', 'text']] } },
  team:         { simple: [['heading', 'Heading', 'text']], repeater: { key: 'items', label: 'Team member', fields: [['name', 'Name', 'text'], ['role', 'Role', 'text'], ['photo_url', 'Photo', 'image']] } },
};

export const emptyRepeaterItem = (fields) => Object.fromEntries(fields.map(([k]) => [k, '']));
