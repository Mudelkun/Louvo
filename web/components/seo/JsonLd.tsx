/**
 * One structured-data document, in the markup.
 *
 * A server component with no client cost: the JSON is serialised during the
 * render and the `<script>` is inert in the browser. It is deliberately not a
 * `<Script>` — `next/script` exists to schedule *executable* JavaScript, and
 * `application/ld+json` is never executed, so deferring it would only risk a
 * crawler fetching the document before the tag it is looking for arrives.
 *
 * `<` is escaped because the payload carries catalogue prose — a hairstyle
 * description with a stray `</script` in it would close this element and hand
 * the rest of the page to the html parser as markup. Nothing in the catalogue
 * contains one today, which is exactly the sort of thing that stops being true
 * the week somebody publishes a cut with an angle bracket in its name.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- inert data, escaped above.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
