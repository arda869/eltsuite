import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleases,validateTestingAccess,checkFeatureRelease} from '../../functions/ai/feature-release.js';
test('release state and testing grants are bounded to the feature catalogue',()=>{
 assert.deepEqual(validateReleases({song:'testing'}),{song:'testing'});
 for(const value of [{song:'unknown'},{invented:'live'},[],null])assert.throws(()=>validateReleases(value));
 assert.deepEqual(validateTestingAccess(['song']),['song']);
 for(const value of [['song','song'],['invented'],null,'song'])assert.throws(()=>validateTestingAccess(value));
});
test('testing access is feature-specific and revocation takes effect immediately',()=>{
 checkFeatureRelease('song',{},[]);
 assert.throws(()=>checkFeatureRelease('song',{song:'testing'},['lyrics']),/testing/);
 checkFeatureRelease('song',{song:'testing'},['song']);
 assert.throws(()=>checkFeatureRelease('song',{song:'testing'},[]),/testing/);
 assert.throws(()=>checkFeatureRelease('song',{song:'off'},['song']),/turned off/);
 checkFeatureRelease('song',{song:'off'},[],true);
 assert.throws(()=>checkFeatureRelease('song',{song:'invalid'},[]),/turned off/);
});
