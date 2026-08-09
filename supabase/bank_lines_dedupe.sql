-- Re-importing a bank statement must not duplicate it.
--
-- The import was a plain insert, so uploading January twice gave you every
-- January line twice — and reconciliation then shows phantom unmatched money
-- that will never match anything. Nobody re-imports on purpose, but everybody
-- does it by accident: the browser tab was left open, the first attempt looked
-- like it failed, two people were handed the same file.
--
-- The natural key is what the bank actually gives you: date, amount, reference
-- and description, within one organisation. Reference alone is not enough —
-- plenty of Nigerian statement lines have none — and description alone is not
-- either, since "POS PURCHASE" repeats all day. Together they identify a line
-- as well as anything can.
--
-- Description is truncated to 120 characters so a trailing-whitespace
-- difference in an otherwise identical export does not defeat the index.

create unique index if not exists bank_lines_natural_key
  on public.bank_statement_lines (
    org_id, line_date, amount,
    coalesce(reference, ''),
    left(coalesce(description, ''), 120)
  );
