# Song sing-along tracks

Newly generated songs automatically prepare a vocal and an instrumental track. The original mix stays available during preparation; a teacher can choose to use only that mix instead. Track preparation does not create a second song or consume another song allowance. Recovery reads the existing result. Source separation can leave faint vocal or instrumental remnants.

The composer previews full song, instrumental and vocals. Adding a prepared song creates two aligned editor tracks. Mute the vocal track to rehearse. Saving retains vocal and backing resources independently, and links them from the recording. Reopening restores both editable tracks. The saved player offers a vocals toggle. Copying the recording to a classroom copies its linked tracks into the same access scope.

The server runs the HT-Demucs vocal specialist; the instrumental is the original mix minus the aligned predicted vocals. Audio is not sent to a new third party. The model is downloaded from a pinned commit and checked against its SHA-256 before use. Jobs are private to the authenticated teacher, expire with the original temporary song, and retain progress/retry state. Saved resources outlive the temporary job.

Model: https://huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx
Export/inference reference: https://github.com/StemSplit/demucs-onnx (MIT; included SONG_SEPARATION_LICENSE.txt).
Original model: https://github.com/facebookresearch/demucs (MIT).
Pinned model revision: 2ef0d757d3e226d0da85fb8c71514f464fcabdd0
SHA-256: 0cbe651f535415c9d26a7bb614f7d322dd5a080fa0298f2e50f478030a994dce
