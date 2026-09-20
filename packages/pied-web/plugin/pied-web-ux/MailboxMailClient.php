<?php

/** A narrow adapter to the tested native row hydrator. MessageList intentionally
 * discards oSequenceSet for an unfiltered list, so it cannot fetch snapshot pages. */
final class PiedWebMailboxMailClient extends \MailSo\Mail\MailClient
{
    public function MessageRowsByUids(string $folder, array $uids): \MailSo\Mail\MessageCollection
    {
        $collection = new \MailSo\Mail\MessageCollection;
        $collection->FolderName = $folder;
        $collection->FolderInfo = $this->ImapClient()->FolderExamine($folder);
        $collection->Limit = \count($uids);
        $collection->totalEmails = \count($uids);
        $this->MessageListByRequestIndexOrUids($collection, new \MailSo\Imap\SequenceSet($uids, true));
        return $collection;
    }
}
