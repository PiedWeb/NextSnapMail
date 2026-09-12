(() => {
class AbstractModel {}
const addObservablesTo=(target,values)=>Object.entries(values).forEach(([key,value])=>target[key]=ko.observable(value));
const addComputablesTo=(target,values)=>Object.entries(values).forEach(([key,value])=>target[key]=ko.computed(value, {pure:true}));
const FileInfo={friendlySize:n=>Math.round(n/1024)+' Ko', getExtension:n=>n.split('.').pop(),getContentType:n=>n.endsWith('.png')?'image/png':n.endsWith('.jpg')?'image/jpeg':'application/octet-stream',getIconClass:()=> 'icon-attachment'};
const pInt=(v,fallback=0)=>parseInt(v)||fallback,SettingsGet=()=>25000000,serverRequest=()=>'/fixture-upload';
const i18n=key=>key,getUploadErrorDescByCode=code=>'upload '+code;
	class ComposeAttachmentModel extends AbstractModel {
		/**
		 * @param {string} id
		 * @param {string} fileName
		 * @param {?number=} size = null
		 * @param {boolean=} isInline = false
		 * @param {boolean=} isLinked = false
		 * @param {string=} cId = ''
		 * @param {string=} contentLocation = ''
		 */
		constructor(id, fileName, size = null, isInline = false, isLinked = false, cId = '', contentLocation = '') {
			super();

			this.id = id;
			this.isInline = !!isInline;
			this.isLinked = !!isLinked;
			this.cId = cId;
			this.contentLocation = contentLocation;
			this.fromMessage = false;

			addObservablesTo(this, {
				fileName: fileName,
				size: size,
				tempName: '',
				type: '', // application/octet-stream

				progress: 0,
				error: '',
				waiting: true,
				uploading: false,
				enabled: true,
				complete: false
			});

			addComputablesTo(this, {
				progressText: () => {
					const p = this.progress();
					return 1 > p ? '' : (100 < p ? 100 : p) + '%';
				},

				progressStyle: () => {
					const p = this.progress();
					return 1 > p ? '' : 'width:' + (100 < p ? 100 : p) + '%';
				},

				title: () => this.error() || this.fileName(),

				friendlySize: () => {
					const localSize = this.size();
					return null === localSize ? '' : FileInfo.friendlySize(localSize);
				},

				mimeType: () => this.type() || FileInfo.getContentType(this.fileName()),
				fileExt: () => FileInfo.getExtension(this.fileName()),

				iconClass: () => FileInfo.getIconClass(this.fileExt(), this.mimeType())
			});
		}
	}

window.NativeImageCompose={
		onBuild(dom) {
			// initUploader
			const oJua = new Jua({
					action: serverRequest('Upload'),
					clickElement: dom.querySelector('#composeUploadButton'),
					dragAndDropElement: dom.querySelector('.b-attachment-place')
				}),
				attachmentSizeLimit = pInt(SettingsGet('attachmentLimit'));

			oJua
				.on('onDragEnter', () => {
					this.dragAndDropOver(true);
				})
				.on('onDragLeave', () => {
					this.dragAndDropOver(false);
				})
				.on('onBodyDragEnter', () => {
					this.attachmentsArea();
					this.dragAndDropVisible(true);
				})
				.on('onBodyDragLeave', () => {
					this.dragAndDropVisible(false);
				})
				.on('onProgress', (id, loaded, total) => {
					let item = this.getAttachmentById(id);
					if (item) {
						item.progress(Math.floor((loaded / total) * 100));
					}
				})
				.on('onSelect', (sId, oData) => {
					this.dragAndDropOver(false);

					const
						size = pInt(oData.size, null),
						attachment = new ComposeAttachmentModel(
							sId,
							oData.fileName ? oData.fileName.toString() : '',
							size
						);

					this.addAttachment(attachment, 1, oJua);

					if (0 < size && 0 < attachmentSizeLimit && attachmentSizeLimit < size) {
						attachment
							.waiting(false)
							.uploading(true)
							.complete(true)
							.error(i18n('UPLOAD/ERROR_FILE_IS_TOO_BIG'));

						return false;
					}

					return true;
				})
				.on('onStart', id => {
					let item = this.getAttachmentById(id);
					if (item) {
						item
							.waiting(false)
							.uploading(true)
							.complete(false);
					}
				})
				.on('onComplete', (id, result, data) => {
					const attachment = this.getAttachmentById(id),
						response = data?.Result || {},
						errorCode = response.code,
						attachmentJson = result && response.Attachment;

					let error = '';
					if (null != errorCode) {
						error = getUploadErrorDescByCode(errorCode);
					} else if (!attachmentJson) {
						error = i18n('UPLOAD/ERROR_UNKNOWN');
					}

					if (attachment) {
						if (error) {
							attachment
								.waiting(false)
								.uploading(false)
								.complete(true)
								.error(error + '\n' + response.message);
						} else if (attachmentJson) {
							attachment
								.waiting(false)
								.uploading(false)
								.complete(true);
							attachment.fileName(attachmentJson.name);
							attachment.size(attachmentJson.size ? pInt(attachmentJson.size) : 0);
							attachment.tempName(attachmentJson.tempName ? attachmentJson.tempName : '');
							attachment.isInline = false;
							attachment.type(attachmentJson.mimeType);
						}
					}
				});

},
		getAttachmentById(id) {
			return this.attachments.find(item => item && id === item.id);
		}
,
		addAttachment(attachment, view, oJua) {
			oJua || attachment.waiting(false).uploading(true);
			attachment.cancel = () => {
				this.attachments.remove(attachment);
				oJua?.cancel(attachment.id);
			};
			this.attachments.push(attachment);
			view && this.attachmentsArea();
		}
};
window.NativeComposeAttachment=ComposeAttachmentModel;})();