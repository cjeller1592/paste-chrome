var $content;
var $publish;
var $url;

function publish(content, font) {
	if (content.trim() == "") {
		return;
	}
	
	$publish.classList.add('disabled');
	setPublishText(font, true);
	$publish.disabled = true;
		
	var post = H.getTitleStrict(content);
	var http = new XMLHttpRequest();
	var url = "https://write.as/api/posts";
	var lang = navigator.languages ? navigator.languages[0] : (navigator.language || navigator.userLanguage);
	lang = lang.substring(0, 2);
	var params = "body=" + encodeURIComponent(post.content) + "&title=" + encodeURIComponent(post.title) + "&font=" + font + "&lang=" + lang + "&rtl=auto";
	http.open("POST", url, true);

	//Send the proper header information along with the request
	http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

	http.onreadystatechange = function() {
		if (http.readyState == 4) {
			$publish.classList.remove('disabled');
			setPublishText(font, false);
			$publish.disabled = false;
			
			if (http.status == 201) {
				$publish.style.display = 'none';

				data = JSON.parse(http.responseText);
				// Pull out data parts
				id = data.data.id;
				if (font == 'code' || font === 'mono') {
					url = "https://paste.as/"+id;
				} else {
					url = "https://write.as/"+id;
				}
				editToken = data.data.token;

				document.getElementById("account-tools").style.display = 'none';
				document.getElementById("publish-holder").style.display = 'none';
				document.getElementById("result-holder").style.display = 'inline';
								
				$url = document.getElementById("url");
				$url.value = url;
				var $urlLink = document.getElementById("url-link");
				$urlLink.href = url;

				// Save the data if user wasn't logged in
				if (typeof data.data.owner === 'undefined' || data.data.owner == "") {
					posts = JSON.parse(H.get('posts', '[]'));
					posts.push(H.createPost(id, editToken, post.content));
					H.set('posts', JSON.stringify(posts));
				}
			} else {
				alert("Failed to post. Please try again.");
			}
		}
	}
	http.send(params);
}

function setPublishText(font, isPublishing) {
	if (font === 'code' || font === 'mono') {
		$publish.value = isPublishing ? 'Pasting...' : 'Paste';
	} else {
		$publish.value = isPublishing ? 'Publishing...' : 'Publish';
	}
}

document.addEventListener('DOMContentLoaded', function() {
	$content = document.getElementById("content");
	$publish = document.getElementById("publish");
	$url = document.getElementById("url");
	var $sync = document.getElementById('sync');
	var $modal = document.getElementById('modal');
	var fontRadios = document.postForm.font;
	var isPopout = window.location.search.substring(1) == "popout";

	if (isPopout) {
		chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
			$content.value = request.msg;
		});
	}
	
	chrome.tabs.executeScript({
	  code: "window.getSelection().toString();"
	}, function(selection) {
	  if (typeof selection !== 'undefined') {
		$content.value = selection[0];
	  }
	  // load previous draft
	  if ($content.value == "") {
		H.load($content, 'ext-draft');
	  }
	});
	
	// focus on the paste field
	$content.focus();
	
	if (isPopout) {
		document.body.className = 'popout';
	} else {
		document.getElementById('popout').addEventListener('click', function(e) {
			e.preventDefault();
			chrome.windows.create({
				url: "popup.html?popout",
				width: 640,
				height: 400,
				focused: true,
				type: "popup"
			}, function(window) {
				chrome.runtime.sendMessage({msg: $content.value});
			});
		});

		document.querySelector('#modal .secondary').addEventListener('click', function(e) {
			e.preventDefault();
			$modal.style.display = 'none';
		});
		$sync.addEventListener('click', function(e) {
			e.preventDefault();
			var posts = JSON.parse(H.get('posts', '[]'));
			if (posts.length == 0) {
				return;
			}
			if ($modal.style.display == 'block') {
				$modal.style.display = 'none';
				return;
			}
			
			var p = "<p>There ";
			p += ((posts.length==1?'is':'are') + ' <strong>' + posts.length + " post" + (posts.length==1?'':'s'));
			var thePosts = posts.length == 1 ? 'it' : 'them';
			p += "</strong> saved on this computer.</p><p>Syncing "+thePosts+" to your account will give you access to "+thePosts+" from anywhere. Sync now?</p>";
			$modal.style.display = 'block';
			document.getElementById('modal-body').innerHTML = p;
		});
		document.querySelector('#modal .primary').addEventListener('click', function(e) {
			e.preventDefault();
			$modal.style.display = 'none';

			var posts = JSON.parse(H.get('posts', '[]'));
			$sync.innerText = "Syncing now...";
			$sync.className = 'disabled';

			var http = new XMLHttpRequest();
			var params = [];
			for (var i=0; i<posts.length; i++) {
				params.push({id: posts[i].id, token: posts[i].token});
			}
			http.open("POST", "https://write.as/api/posts/claim", true);
			http.setRequestHeader("Content-type", "application/json");
			http.onreadystatechange = function() {
				if (http.readyState == 4) {
					$sync.innerText = 'Importing now...';
					if (http.status == 200) {
						var res = JSON.parse(http.responseText);
						if (res.data.length > 0) {
							if (res.data.length != posts.length) {
								// TODO: handle this serious situation
								console.error("Request and result array length didn't match!");
								return;
							}
							for (var i=0; i<res.data.length; i++) {
								if (res.data[i].code == 200 || res.data[i].code == 404) {
									// Post successfully claimed.
									for (var j=0; j<posts.length; j++) {
										// Find post in local store
										var id = res.data[i].id;
										if (typeof res.data[i].post !== 'undefined') {
											id = res.data[i].post.id;
										}
										if (posts[j].id == id) {
											// Remove this post
											posts.splice(j, 1);
											break;
										}
									}
								} else {
									for (var j=0; j<posts.length; j++) {
										// Find post in local store
										if (posts[j].id == res.data[i].id) {
											// Note the error in the local post
											posts[j].error = res.data[i].error_msg;
											break;
										}
									}
								}
							}
							H.set('posts', JSON.stringify(posts));
							$sync.innerText = 'Synced.';
						}
					} else {
						// TODO: show error visually (option to retry)
						console.error("Well that didn't work at all!");
						$sync.className = '';
						$sync.innerText = 'Sync...';
					}
				}
			};
			http.send(JSON.stringify(params));
		});
	}

	// bind publish action
	$publish.addEventListener('click', function(e) {
		e.preventDefault();
		publish($content.value, fontRadios.value);
	});
	$content.addEventListener('keydown', function(e){
		if (e.ctrlKey && e.keyCode == 13) {
			e.preventDefault();
			publish($content.value, fontRadios.value);
		}
	});
	
	// bind URL select-all action
	$url.addEventListener('focus', function(e) {
		e.preventDefault();
		this.select();
	});
	
	// load font setting
	H.load(fontRadios, 'font');
	$content.className = fontRadios.value;
	setPublishText(fontRadios.value, false);
	// bind font changing action
	for(var i = 0; i < fontRadios.length; i++) {
		fontRadios[i].onclick = function() {
			$content.className = this.value;
			setPublishText(this.value, false);
			H.save(fontRadios, 'font');
		};
	}

	var handleRegUser = function() {
		var http = new XMLHttpRequest();
		http.open("GET", "https://write.as/api/me/", true);
		http.onreadystatechange = function() {
			if (http.readyState == 4) {
				data = JSON.parse(http.responseText);
				data = data.data;
				if (typeof data.username !== 'undefined' && data.username != "") {
					var $accTools = document.getElementById("account-tools")
					$accTools.style.display = 'block';
					var posts = JSON.parse(H.get('posts', '[]'));
					if (posts.length > 0) {
						$sync.style.display = 'inline';
					} else {
						$sync.style.display = 'none';
					}
					//document.getElementById("sync-count").innerText = posts.length + " post" + (posts.length==1?'':'s');
					document.getElementById("username").innerText = data.username;
				}
			}
		}
		http.send();
	}
	handleRegUser();
	
	if (H.get('updatedPostsMeta', '') == '') {
		// Add metadata used by Pad to all saved posts
		var addPostMetaData = function() {
			console.log('Adding post meta data...');
			var fetch = function(id, token, callback) {
				var http = new XMLHttpRequest();
				http.open("GET", "https://write.as/api/" + id + "?created=1&t=" + token, true);
				http.onreadystatechange = function() {
					if (http.readyState == 4) {
						callback(http.responseText, http.status);
					}
				}
				http.send();
			}
		
			var posts = JSON.parse(H.get('posts', '[]'));
			var migratedPosts = [];
			var failedPosts = [];
			if (posts.length > 0) {
				var i = 0;
				var updateMeta = function(content, status) {
					if (status == 200) {
						data = content.split("\n\n");
						created = data.splice(0, 1);
						migratedPosts.push(H.createPost(posts[i].id, posts[i].token, data.join("\n\n"), created));
					} else {
						posts[i].reason = status;
						failedPosts.push(posts[i]);
					}
				
					i++;
					if (i < posts.length) {
						fetch(posts[i].id, posts[i].token, updateMeta);
					} else {
						console.log('Finished! Success: ' + migratedPosts.length + '. Fail: ' + failedPosts.length);
						if (failedPosts.length > 0) {
							H.set('failedMigrationPosts', JSON.stringify(failedPosts));
						}
						H.set('posts', JSON.stringify(migratedPosts));
						H.set('updatedPostsMeta', 'yes');
					}
				};
				fetch(posts[i].id, posts[i].token, updateMeta);
			} else {
				H.set('updatedPostsMeta', 'yes');
			}
		};
		addPostMetaData();
	}
});
