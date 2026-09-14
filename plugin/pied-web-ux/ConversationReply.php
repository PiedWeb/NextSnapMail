<?php

/** Keep a sent reply in its original folder so native IMAP threading can find it. */
final class PiedWebConversationReply
{
    public static function copy($actions, $stream, int $size): bool
    {
        $draftInfo = $actions->GetActionParam('draftInfo', null);
        $saveFolder = (string) $actions->GetActionParam('saveFolder', '');
        $sourceFolder = is_array($draftInfo) && array_is_list($draftInfo) && count($draftInfo) === 3 && is_string($draftInfo[2])
            ? $draftInfo[2] : '';
        if (!is_array($draftInfo) || !array_is_list($draftInfo) || count($draftInfo) !== 3
            || !in_array($draftInfo[0], ['reply', 'reply-all'], true)
            || filter_var($draftInfo[1], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false
            || !$sourceFolder || !$saveFolder || $sourceFolder === $saveFolder
            || !is_resource($stream) || $size < 1) {
            return false;
        }

        // The native send has already authenticated this account and completed SMTP.
        // Its saved stream has Bcc handling applied and will still be appended to Sent.
        try {
            if (!rewind($stream)) return false;
            $actions->ImapClient()->MessageAppendStream(
                $sourceFolder, $stream, $size, [\MailSo\Imap\Enumerations\MessageFlag::SEEN]
            );
            return true;
        } catch (\Throwable $error) {
            // A failed conversation copy must not prevent the normal Sent copy.
            error_log('Pied Web UX: could not save a conversation reply copy');
            return false;
        } finally {
            rewind($stream);
        }
    }
}
